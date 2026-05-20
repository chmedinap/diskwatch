import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.alerts import seed_default_rules
from app.database import Base, engine, SessionLocal
from app.routers import disks, scan
from app.routers.alerts import router as alerts_router
from app.routers.health import router as health_router
from app.scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(disks.router, prefix="/api")
app.include_router(scan.router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
