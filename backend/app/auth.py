import logging
import secrets
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 30

# Use configured key or generate an ephemeral one (invalidated on restart).
_SECRET: str = settings.secret_key or secrets.token_hex(32)
if not settings.secret_key:
    logger.warning(
        "SECRET_KEY is not set — JWT tokens will be invalidated on container restart. "
        "Set SECRET_KEY in your .env to make sessions persistent."
    )

_bearer = HTTPBearer(auto_error=False)


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": username, "exp": expire}, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> str:
    payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    sub = payload.get("sub")
    if not sub:
        raise ValueError("missing sub")
    return sub


# ── FastAPI dependency ────────────────────────────────────────────────────────

def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Return the username from a valid Bearer token, or raise 401."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return decode_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
