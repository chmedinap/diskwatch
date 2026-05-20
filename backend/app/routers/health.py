from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health", response_model=schemas.HealthSummary)
def get_health(db: Session = Depends(get_db)):
    disks = db.query(models.Disk).all()

    total = len(disks)
    healthy = failed = unknown = 0
    last_scan_at = None

    for disk in disks:
        latest = (
            db.query(models.SmartSnapshot)
            .filter(models.SmartSnapshot.disk_id == disk.id)
            .order_by(models.SmartSnapshot.timestamp.desc())
            .first()
        )
        if latest:
            if last_scan_at is None or latest.timestamp > last_scan_at:
                last_scan_at = latest.timestamp
            if latest.overall_health == "PASSED":
                healthy += 1
            elif latest.overall_health == "FAILED":
                failed += 1
            else:
                unknown += 1
        else:
            unknown += 1

    unacknowledged = (
        db.query(models.AlertEvent)
        .filter(models.AlertEvent.acknowledged.is_(False))
        .count()
    )

    return schemas.HealthSummary(
        total_disks=total,
        healthy=healthy,
        failed=failed,
        unknown=unknown,
        last_scan_at=last_scan_at,
        unacknowledged_alerts=unacknowledged,
    )
