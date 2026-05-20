from fastapi import APIRouter, Depends, HTTPException, status

from app import models, schemas
from app.auth import create_token, hash_password, require_auth, verify_password
from app.database import SessionLocal, get_db
from sqlalchemy.orm import Session

router = APIRouter(tags=["auth"])


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
def auth_login(body: schemas.AuthLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return schemas.AuthToken(access_token=create_token(user.username), username=user.username)


@router.get("/auth/me", response_model=schemas.AuthMe)
def auth_me(username: str = Depends(require_auth)):
    return schemas.AuthMe(username=username)
