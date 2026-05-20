from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import require_auth
from app.database import get_db

router = APIRouter(tags=["schedules"])


@router.get("/disks/{disk_id}/schedules", response_model=list[schemas.TestScheduleRead])
def list_schedules(
    disk_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_auth),
):
    _get_disk_or_404(db, disk_id)
    return db.query(models.TestSchedule).filter(models.TestSchedule.disk_id == disk_id).all()


@router.put(
    "/disks/{disk_id}/schedules/{test_type}",
    response_model=schemas.TestScheduleRead,
)
def upsert_schedule(
    disk_id: int,
    test_type: str,
    body: schemas.TestScheduleUpsert,
    db: Session = Depends(get_db),
    _: str = Depends(require_auth),
):
    if test_type not in ("short", "long"):
        raise HTTPException(status_code=422, detail="test_type must be 'short' or 'long'")
    if not (1 <= body.interval_hours <= 24):
        raise HTTPException(status_code=422, detail="interval_hours must be between 1 and 24")
    _get_disk_or_404(db, disk_id)

    sched = (
        db.query(models.TestSchedule)
        .filter(
            models.TestSchedule.disk_id == disk_id,
            models.TestSchedule.test_type == test_type,
        )
        .first()
    )
    if sched:
        sched.interval_hours = body.interval_hours
        sched.enabled = body.enabled
    else:
        sched = models.TestSchedule(
            disk_id=disk_id,
            test_type=test_type,
            interval_hours=body.interval_hours,
            enabled=body.enabled,
            created_at=datetime.utcnow(),
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)
    return sched


@router.delete("/disks/{disk_id}/schedules/{test_type}", status_code=204)
def delete_schedule(
    disk_id: int,
    test_type: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_auth),
):
    sched = (
        db.query(models.TestSchedule)
        .filter(
            models.TestSchedule.disk_id == disk_id,
            models.TestSchedule.test_type == test_type,
        )
        .first()
    )
    if sched:
        db.delete(sched)
        db.commit()


def _get_disk_or_404(db: Session, disk_id: int) -> models.Disk:
    disk = db.query(models.Disk).filter(models.Disk.id == disk_id).first()
    if not disk:
        raise HTTPException(status_code=404, detail="Disk not found")
    return disk
