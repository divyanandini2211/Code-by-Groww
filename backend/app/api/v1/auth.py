from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.schemas import User, UserAuthToken, UserSession
from app.core.auth import (
    hash_password, verify_password, generate_session_token,
    get_current_user, get_optional_user
)
from app.services.market_service import market_service

router = APIRouter()

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    token: Optional[str] = None
    last_checkpoint: Optional[str] = None

@router.post("/register")
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Registers a new user in Neon PostgreSQL and creates a session token."""
    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check if user already exists
    res = await db.execute(select(User).filter(User.email == email_clean))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Create User
    new_user = User(
        name=payload.name.strip() or "Groww Trader",
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

    # Initialize user's market session checkpoint to current virtual market time
    current_time = market_service.get_current_virtual_time()
    user_session = UserSession(
        user_id=new_user.id,
        last_visited_at=current_time,
        device_info="Groww Web Client"
    )
    db.add(user_session)

    await db.commit()
    await db.refresh(new_user)

    return {
        "status": "success",
        "token": token_str,
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
            "last_checkpoint": current_time.isoformat()
        }
    }

@router.post("/login")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticates user against Neon DB and returns new active session token."""
    email_clean = payload.email.strip().lower()
    res = await db.execute(select(User).filter(User.email == email_clean))
    user = res.scalars().first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Issue Session Token
    token_str = generate_session_token()
    token_rec = UserAuthToken(
        token=token_str,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db.add(token_rec)

    # Fetch last checkpoint
    sess_res = await db.execute(select(UserSession).filter(UserSession.user_id == user.id))
    user_sess = sess_res.scalars().first()
    checkpoint_str = user_sess.last_visited_at.isoformat() if user_sess else None

    await db.commit()

    return {
        "status": "success",
        "token": token_str,
        "user": {
            "id": user.id,
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
    """Returns profile and current checkpoint for the logged-in session."""
    sess_res = await db.execute(select(UserSession).filter(UserSession.user_id == user.id))
    user_sess = sess_res.scalars().first()
    checkpoint_str = user_sess.last_visited_at.isoformat() if user_sess else None

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "last_checkpoint": checkpoint_str
    }

@router.post("/logout")
async def logout(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Revokes the current session token."""
    if authorization and authorization.startswith("Bearer "):
        token_val = authorization.split("Bearer ", 1)[1].strip()
        res = await db.execute(select(UserAuthToken).filter(UserAuthToken.token == token_val))
        token_rec = res.scalars().first()
        if token_rec:
            await db.delete(token_rec)
            await db.commit()
    return {"status": "logged_out"}

@router.post("/checkpoint")
async def save_auth_checkpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Persists checkpoint for authenticated user in Neon DB."""
    current_time = market_service.get_current_virtual_time()
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
