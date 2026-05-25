import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.alerts import seed_default_rules
from app.auth import require_auth
from app.database import Base, engine, SessionLocal
from app.routers import disks, scan
from app.routers.alerts import router as alerts_router
from app.routers.auth import router as auth_router, limiter as auth_limiter
from app.routers.health import router as health_router
from app.routers.schedules import router as schedules_router
from app.scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)


def _apply_migrations() -> None:
    """Add new columns to existing tables without Alembic."""
    with engine.connect() as conn:
        for col, typedef in [("used_bytes", "INTEGER"), ("free_bytes", "INTEGER"), ("mount_point", "VARCHAR(256)")]:
            try:
                conn.execute(text(f"ALTER TABLE disks ADD COLUMN {col} {typedef}"))
                conn.commit()
            except Exception:
                pass  # Column already exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _apply_migrations()
    db = SessionLocal()
    try:
        seed_default_rules(db)
    finally:
        db.close()
    scheduler = start_scheduler()
    yield
    scheduler.shutdown()


app = FastAPI(
    title="DiskWatch API",
    description="SMART disk health monitoring",
    version="0.5.0",
    lifespan=lifespan,
)

app.state.limiter = auth_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(require_auth)]

# Auth routes are public (no token required for status/setup/login).
app.include_router(auth_router, prefix="/api")

# All other routes require a valid JWT.
app.include_router(disks.router, prefix="/api", dependencies=_auth)
app.include_router(scan.router, prefix="/api", dependencies=_auth)
app.include_router(health_router, prefix="/api", dependencies=_auth)
app.include_router(alerts_router, prefix="/api", dependencies=_auth)
app.include_router(schedules_router, prefix="/api", dependencies=_auth)
