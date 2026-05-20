from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.alerts import compute_score
from app.config import settings
from app.database import get_db
from app.smart import SmartCollector

router = APIRouter(prefix="/disks", tags=["disks"])

# ATA attribute IDs commonly used for temperature.
# NVMe temperature is also stored under 194 (see smart.py _NVME_ATTR_MAP).
_TEMP_ATTR_IDS = (190, 194)


@router.get("/", response_model=list[schemas.DiskListItem])
def list_disks(db: Session = Depends(get_db)):
    disks = db.query(models.Disk).order_by(models.Disk.name).all()
    result: list[schemas.DiskListItem] = []
    for disk in disks:
        latest = (
            db.query(models.SmartSnapshot)
            .filter(models.SmartSnapshot.disk_id == disk.id)
            .order_by(models.SmartSnapshot.timestamp.desc())
            .first()
        )
        result.append(schemas.DiskListItem(
            id=disk.id,
            name=disk.name,
            model=disk.model,
            serial=disk.serial,
            interface=disk.interface,
            capacity_gb=disk.capacity_gb,
            overall_health=latest.overall_health if latest else None,
            last_seen=disk.last_seen,
            last_snapshot_at=latest.timestamp if latest else None,
        ))
    return result


@router.get("/{disk_id}", response_model=schemas.DiskDetail)
def get_disk(disk_id: int, db: Session = Depends(get_db)):
    disk = db.query(models.Disk).filter(models.Disk.id == disk_id).first()
    if not disk:
        raise HTTPException(status_code=404, detail="Disk not found")

    latest = (
        db.query(models.SmartSnapshot)
        .filter(models.SmartSnapshot.disk_id == disk_id)
        .order_by(models.SmartSnapshot.timestamp.desc())
        .first()
    )

    attributes: list[models.SmartAttribute] = []
    if latest:
        attributes = (
            db.query(models.SmartAttribute)
            .filter(models.SmartAttribute.snapshot_id == latest.id)
            .order_by(models.SmartAttribute.attr_id)
            .all()
        )

    return schemas.DiskDetail(
        id=disk.id,
        name=disk.name,
        model=disk.model,
        serial=disk.serial,
        firmware=disk.firmware,
        interface=disk.interface,
        capacity_gb=disk.capacity_gb,
        first_seen=disk.first_seen,
        last_seen=disk.last_seen,
        latest_snapshot=schemas.SnapshotRead.model_validate(latest) if latest else None,
        attributes=[schemas.SmartAttributeRead.model_validate(a) for a in attributes],
    )


@router.get("/{disk_id}/history", response_model=schemas.AttributeHistory)
def get_attribute_history(
    disk_id: int,
    attr: int = Query(..., description="SMART attribute ID, e.g. 5, 190, 194"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    if not db.query(models.Disk).filter(models.Disk.id == disk_id).first():
        raise HTTPException(status_code=404, detail="Disk not found")

    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(models.SmartSnapshot.timestamp, models.SmartAttribute)
        .join(
            models.SmartAttribute,
            models.SmartAttribute.snapshot_id == models.SmartSnapshot.id,
        )
        .filter(
            models.SmartSnapshot.disk_id == disk_id,
            models.SmartSnapshot.timestamp >= since,
            models.SmartAttribute.attr_id == attr,
        )
        .order_by(models.SmartSnapshot.timestamp.asc())
        .all()
    )

    attr_name = rows[0][1].attr_name if rows else None
    return schemas.AttributeHistory(
        disk_id=disk_id,
        attr_id=attr,
        attr_name=attr_name,
        data=[
            schemas.AttributeHistoryPoint(
                timestamp=ts,
                value=a.value,
                raw_value=a.raw_value,
            )
            for ts, a in rows
        ],
    )


@router.get("/{disk_id}/temperature/history", response_model=list[schemas.TemperaturePoint])
def get_temperature_history(
    disk_id: int,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    if not db.query(models.Disk).filter(models.Disk.id == disk_id).first():
        raise HTTPException(status_code=404, detail="Disk not found")

    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(models.SmartSnapshot.timestamp, models.SmartAttribute.raw_value)
        .join(
            models.SmartAttribute,
            models.SmartAttribute.snapshot_id == models.SmartSnapshot.id,
        )
        .filter(
            models.SmartSnapshot.disk_id == disk_id,
            models.SmartSnapshot.timestamp >= since,
            models.SmartAttribute.attr_id.in_(_TEMP_ATTR_IDS),
        )
        .order_by(models.SmartSnapshot.timestamp.asc())
        .all()
    )

    # De-duplicate by timestamp (a snapshot can have both attr 190 and 194);
    # keep the first one encountered (ordered by timestamp asc).
    seen: set[datetime] = set()
    result: list[schemas.TemperaturePoint] = []
    for ts, raw in rows:
        ts_key = ts.replace(microsecond=0)
        if ts_key not in seen and raw is not None:
            seen.add(ts_key)
            result.append(schemas.TemperaturePoint(timestamp=ts, temperature=float(raw)))
    return result


@router.post("/{disk_id}/test/{test_type}", response_model=schemas.TestResult)
def trigger_self_test(
    disk_id: int,
    test_type: str,
    db: Session = Depends(get_db),
):
    if test_type not in ("short", "long"):
        raise HTTPException(status_code=400, detail="test_type must be 'short' or 'long'")

    disk = db.query(models.Disk).filter(models.Disk.id == disk_id).first()
    if not disk:
        raise HTTPException(status_code=404, detail="Disk not found")

    collector = SmartCollector(smartctl_path=settings.smartctl_path)
    try:
        data = collector.run_self_test(disk.name, test_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    messages = data.get("smartctl", {}).get("messages", [])
    message = messages[0].get("string", "Test initiated") if messages else "Test initiated"
    return schemas.TestResult(device=disk.name, test_type=test_type, message=message)


@router.get("/{disk_id}/score", response_model=schemas.HealthScore)
def get_health_score(disk_id: int, db: Session = Depends(get_db)):
    if not db.query(models.Disk).filter(models.Disk.id == disk_id).first():
        raise HTTPException(status_code=404, detail="Disk not found")

    latest = (
        db.query(models.SmartSnapshot)
        .filter(models.SmartSnapshot.disk_id == disk_id)
        .order_by(models.SmartSnapshot.timestamp.desc())
        .first()
    )
    if not latest:
        return schemas.HealthScore(disk_id=disk_id, score=100, deductions=[])

    attrs = {
        a.attr_id: a
        for a in db.query(models.SmartAttribute)
        .filter(models.SmartAttribute.snapshot_id == latest.id)
        .all()
    }
    score, deductions = compute_score(attrs, latest.overall_health)
    return schemas.HealthScore(disk_id=disk_id, score=score, deductions=deductions)
