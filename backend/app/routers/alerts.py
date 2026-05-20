from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ── Rules ─────────────────────────────────────────────────────────────────────

@router.get("/rules", response_model=list[schemas.AlertRuleRead])
def list_rules(db: Session = Depends(get_db)):
    return (
        db.query(models.AlertRule).order_by(models.AlertRule.id).all()
    )


@router.post("/rules", response_model=schemas.AlertRuleRead, status_code=201)
def create_rule(body: schemas.AlertRuleCreate, db: Session = Depends(get_db)):
    rule = models.AlertRule(**body.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=schemas.AlertRuleRead)
def update_rule(
    rule_id: int, body: schemas.AlertRuleUpdate, db: Session = Depends(get_db)
):
    rule = db.query(models.AlertRule).filter(models.AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, val)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(models.AlertRule).filter(models.AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events", response_model=list[schemas.AlertEventRead])
def list_events(
    limit: int = Query(200, ge=1, le=1000),
    disk_id: int | None = Query(None),
    unacknowledged_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.AlertEvent)
        .order_by(models.AlertEvent.triggered_at.desc())
    )
    if disk_id is not None:
        q = q.filter(models.AlertEvent.disk_id == disk_id)
    if unacknowledged_only:
        q = q.filter(models.AlertEvent.acknowledged.is_(False))
    return q.limit(limit).all()


@router.patch("/events/{event_id}/acknowledge", response_model=schemas.AlertEventRead)
def acknowledge_event(event_id: int, db: Session = Depends(get_db)):
    event = (
        db.query(models.AlertEvent).filter(models.AlertEvent.id == event_id).first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.acknowledged = True
    db.commit()
    db.refresh(event)
    return event


@router.post("/events/acknowledge-all", status_code=204)
def acknowledge_all(db: Session = Depends(get_db)):
    db.query(models.AlertEvent).filter(
        models.AlertEvent.acknowledged.is_(False)
    ).update({"acknowledged": True})
    db.commit()


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = (
        db.query(models.AlertEvent).filter(models.AlertEvent.id == event_id).first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
