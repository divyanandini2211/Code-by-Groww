import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.schemas import User, UserAuthToken, UserSession

def hash_password(password: str) -> str:
    """Secure PBKDF2 HMAC-SHA256 password hasher using standard library."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}${key.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against stored salt$hash."""
    try:
        salt, key_hex = hashed_password.split('$', 1)
        expected = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return secrets.compare_digest(expected.hex(), key_hex)
    except Exception:
        return False

def generate_session_token() -> str:
    return secrets.token_hex(32)

async def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Resolves user if Bearer token is present and valid; returns None otherwise."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token_val = authorization.split("Bearer ", 1)[1].strip()
    now = datetime.now(timezone.utc)

    res = await db.execute(
        select(UserAuthToken).filter(
            UserAuthToken.token == token_val,
            UserAuthToken.expires_at > now
        )
    )
    auth_token = res.scalars().first()
    if not auth_token:
        return None

    user_res = await db.execute(select(User).filter(User.id == auth_token.user_id))
    return user_res.scalars().first()

async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Requires valid Bearer token authentication."""
    user = await get_optional_user(authorization, db)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required or session expired."
        )
    return user
