import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.schemas import User, UserAuthToken, UserSession, Watchlist, WatchlistItem, Stock
from app.core.auth import (
    hash_password, verify_password, generate_session_token,
    get_current_user, get_optional_user
)
from app.services.market_service import market_service

# Default watchlist presets for new users
DEFAULT_WATCHLISTS = [
    {
        "name": "Nifty 50 Top Picks",
        "description": "Blue-chip large-cap leaders",
        "symbols": ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "KOTAKBANK", "LT", "SBIN"]
    },
    {
        "name": "High Growth",
        "description": "High-momentum growth stocks",
        "symbols": ["BAJFINANCE", "ADANIENT", "TATAMOTORS", "WIPRO", "AXISBANK", "MARUTI"]
    },
]

router = APIRouter()

class RegisterRequest(BaseModel):
    username: str
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    identifier: Optional[str] = None  # Accepts either username or email
    email: Optional[str] = None       # Backwards-compatible
    password: str

class UserResponse(BaseModel):
    id: str
    username: Optional[str] = None
    name: str
    email: str
    token: Optional[str] = None
    last_checkpoint: Optional[str] = None

@router.get("/check-username")
async def check_username(username: str, db: AsyncSession = Depends(get_db)):
    """Verifies that a proposed username is unique and conforms to standards."""
    clean_u = username.strip().lower()
    if not clean_u:
        return {"available": False, "reason": "Username cannot be empty"}
    if len(clean_u) < 3:
        return {"available": False, "reason": "Must be at least 3 characters"}
    if len(clean_u) > 30:
        return {"available": False, "reason": "Must be 30 characters or fewer"}
    if not re.match(r"^[a-zA-Z0-9_]+$", clean_u):
        return {"available": False, "reason": "Only letters, numbers, and underscores allowed"}

    res = await db.execute(select(User).filter(func.lower(User.username) == clean_u))
    if res.scalars().first():
        return {"available": False, "reason": "Username is already taken"}
    return {"available": True, "reason": "Username is available"}

@router.post("/register")
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Registers a new user with unique username in Neon PostgreSQL and seeds default watchlists."""
    username_clean = payload.username.strip().lower()
    if not username_clean or len(username_clean) < 3 or len(username_clean) > 30 or not re.match(r"^[a-zA-Z0-9_]+$", username_clean):
        raise HTTPException(status_code=400, detail="Username must be 3-30 characters (letters, numbers, underscores only)")

    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Verify unique username
    u_res = await db.execute(select(User).filter(func.lower(User.username) == username_clean))
    if u_res.scalars().first():
        raise HTTPException(status_code=400, detail="Username is already taken. Please choose another.")

    # Check if user with email already exists
    res = await db.execute(select(User).filter(func.lower(User.email) == email_clean))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Create User with verified unique username
    new_user = User(
        username=username_clean,
        name=payload.name.strip() or username_clean,
        email=email_clean,
        password_hash=hash_password(payload.password)
    )
    db.add(new_user)
    await db.flush()

    # Create Initial Session Token (valid for 30 days)
    token_str = generate_session_token()
    token_rec = UserAuthToken(
        token=token_str,
        user_id=new_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db.add(token_rec)

    # Initialize user's market session checkpoint to 30 mins prior in real time
    # so the AI engine has a consistent baseline upon initial sign up
    now_real = datetime.now(timezone.utc)
    initial_checkpoint = now_real - timedelta(minutes=30)
    user_session = UserSession(
        user_id=new_user.id,
        last_visited_at=initial_checkpoint,
        device_info="Groww Web Client"
    )
    db.add(user_session)

    # Seed default watchlists for new user
    valid_symbols_res = await db.execute(select(Stock.symbol))
    valid_symbols = {row[0] for row in valid_symbols_res.all()}

    for preset in DEFAULT_WATCHLISTS:
        wl = Watchlist(
            name=preset["name"],
            description=preset["description"],
            user_id=new_user.id
        )
        db.add(wl)
        await db.flush()  # Get the wl.id before adding items
        for symbol in preset["symbols"]:
            if symbol in valid_symbols:
                db.add(WatchlistItem(watchlist_id=wl.id, symbol=symbol))

    await db.commit()
    await db.refresh(new_user)

    return {
        "status": "success",
        "token": token_str,
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "name": new_user.name,
            "email": new_user.email,
            "last_checkpoint": initial_checkpoint.isoformat()
        }
    }

@router.post("/login")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticates user against Neon DB by email OR username, returning new active session token."""
    login_id = (payload.identifier or payload.email or "").strip().lower()
    if not login_id:
        raise HTTPException(status_code=400, detail="Email or username is required")

    res = await db.execute(
        select(User).filter(
            or_(
                func.lower(User.email) == login_id,
                func.lower(User.username) == login_id
            )
        )
    )
    user = res.scalars().first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email/username or password")

    # Issue Session Token
    token_str = generate_session_token()
    token_rec = UserAuthToken(
        token=token_str,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db.add(token_rec)

    # Fetch last checkpoint for away-window calculation
    sess_res = await db.execute(select(UserSession).filter(UserSession.user_id == user.id))
    user_sess = sess_res.scalars().first()
    checkpoint_str = user_sess.last_visited_at.isoformat() if user_sess else None

    await db.commit()

    return {
        "status": "success",
        "token": token_str,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "email": user.email,
            "last_checkpoint": checkpoint_str
        }
    }

@router.get("/me")
async def get_current_user_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns profile with username and current checkpoint for the logged-in session."""
    sess_res = await db.execute(select(UserSession).filter(UserSession.user_id == user.id))
    user_sess = sess_res.scalars().first()
    checkpoint_str = user_sess.last_visited_at.isoformat() if user_sess else None

    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "last_checkpoint": checkpoint_str
    }

@router.post("/logout")
async def logout(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Revokes session token and automatically stores the logout timestamp for away tracking."""
    if authorization and authorization.startswith("Bearer "):
        token_val = authorization.split("Bearer ", 1)[1].strip()
        res = await db.execute(select(UserAuthToken).filter(UserAuthToken.token == token_val))
        token_rec = res.scalars().first()
        if token_rec:
            # Auto-track away timestamp: record the moment user logged out
            current_time = datetime.now(timezone.utc)
            sess_res = await db.execute(select(UserSession).filter(UserSession.user_id == token_rec.user_id))
            user_sess = sess_res.scalars().first()
            if user_sess:
                user_sess.last_visited_at = current_time
            else:
                db.add(UserSession(user_id=token_rec.user_id, last_visited_at=current_time))

            await db.delete(token_rec)
            await db.commit()
    return {"status": "logged_out"}

@router.post("/checkpoint")
async def save_auth_checkpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Persists checkpoint for authenticated user in Neon DB."""
    current_time = datetime.now(timezone.utc)
    res = await db.execute(select(UserSession).filter(UserSession.user_id == user.id))
    session = res.scalars().first()
    if not session:
        session = UserSession(user_id=user.id, last_visited_at=current_time)
        db.add(session)
    else:
        session.last_visited_at = current_time
    await db.commit()
    return {
        "status": "checkpoint_saved",
        "user_id": user.id,
        "last_visited_at": current_time.isoformat()
    }
