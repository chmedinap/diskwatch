from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import create_token, hash_password, require_auth, verify_password
from app.database import SessionLocal, get_db

router = APIRouter(tags=["auth"])

limiter = Limiter(key_func=get_remote_address)


@router.get("/auth/status", response_model=schemas.AuthStatus)
def auth_status(db: Session = Depends(get_db)):
    """Public — returns whether first-time setup is still needed."""
    setup_required = db.query(models.User).count() == 0
    return schemas.AuthStatus(setup_required=setup_required)


@router.post("/auth/setup", response_model=schemas.AuthToken, status_code=201)
def auth_setup(body: schemas.AuthSetup, db: Session = Depends(get_db)):
    """Create the first admin user. Only works when no users exist."""
    if db.query(models.User).count() > 0:
        raise HTTPException(status_code=403, detail="Setup already completed")
    if not body.username.strip() or not body.password:
        raise HTTPException(status_code=422, detail="Username and password are required")
    user = models.User(
        username=body.username.strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    return schemas.AuthToken(access_token=create_token(user.username), username=user.username)


@router.post("/auth/login", response_model=schemas.AuthToken)
@limiter.limit("10/minute")
async def auth_login(request: Request, body: schemas.AuthLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return schemas.AuthToken(access_token=create_token(user.username), username=user.username)


@router.get("/auth/me", response_model=schemas.AuthMe)
def auth_me(username: str = Depends(require_auth)):
    return schemas.AuthMe(username=username)


@router.post("/auth/password", status_code=204)
def change_password(
    body: schemas.AuthPasswordChange,
    username: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="New password must be at least 6 characters")
    user.password_hash = hash_password(body.new_password)
    db.commit()
