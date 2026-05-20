"""Alert evaluation and webhook dispatch."""

import json
import logging
import urllib.request
from datetime import timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.utils import utcnow

logger = logging.getLogger(__name__)

# Don't re-fire the same rule+disk combination within this window.
_COOLDOWN_HOURS = 4

_CRITICAL_ATTR_IDS = {5, 187, 188, 197, 198}


# ── Default rule seeding ──────────────────────────────────────────────────────

def seed_default_rules(db: Session) -> None:
    if db.query(models.AlertRule).count() > 0:
        return

    defaults = [
        models.AlertRule(
            name="Temperature critical (>55°C)",
            attr_id=194,
            condition="gt",
            threshold_value=55.0,
            notification_type="both",
        ),
        models.AlertRule(
            name="Airflow temperature critical (>55°C)",
            attr_id=190,
            condition="gt",
            threshold_value=55.0,
            notification_type="both",
        ),
        models.AlertRule(
            name="Reallocated sectors increased",
            attr_id=5,
            condition="change",
            threshold_value=None,
            notification_type="both",
        ),
        models.AlertRule(
            name="Pending sectors > 0",
            attr_id=197,
            condition="gt",
            threshold_value=0.0,
            notification_type="both",
        ),
        models.AlertRule(
            name="Uncorrectable errors > 0",
            attr_id=198,
            condition="gt",
            threshold_value=0.0,
            notification_type="both",
        ),
        models.AlertRule(
            name="Overall health FAILED",
            attr_id=None,
            condition="failed",
            threshold_value=None,
            notification_type="both",
        ),
    ]
    for rule in defaults:
        db.add(rule)
    db.commit()
    logger.info("Seeded %d default alert rules", len(defaults))


# ── Evaluator ─────────────────────────────────────────────────────────────────

class AlertEvaluator:
    def __init__(self, db: Session) -> None:
        self.db = db

    def evaluate(self, disk: models.Disk, snapshot: models.SmartSnapshot) -> None:
        rules = (
            self.db.query(models.AlertRule)
            .filter(
                models.AlertRule.enabled.is_(True),
                or_(
                    models.AlertRule.disk_id == disk.id,
                    models.AlertRule.disk_id.is_(None),
                ),
            )
            .all()
        )

        # Build attr_id → SmartAttribute map for this snapshot (already flushed).
        attr_map: dict[int, models.SmartAttribute] = {
            a.attr_id: a
            for a in self.db.query(models.SmartAttribute)
            .filter(models.SmartAttribute.snapshot_id == snapshot.id)
            .all()
        }

        for rule in rules:
            self._check(disk, snapshot, rule, attr_map)

    def _check(
        self,
        disk: models.Disk,
        snapshot: models.SmartSnapshot,
        rule: models.AlertRule,
        attr_map: dict[int, models.SmartAttribute],
    ) -> None:
        triggered = False
        triggered_value: float | None = None
        message = ""
        attr_obj: models.SmartAttribute | None = None

        if rule.condition == "failed":
            if snapshot.overall_health == "FAILED":
                triggered = True
                message = f"{disk.name}: SMART overall health is FAILED"

        elif rule.attr_id is not None:
            attr_obj = attr_map.get(rule.attr_id)
            if attr_obj is None or attr_obj.raw_value is None:
                return

            raw = attr_obj.raw_value
            label = attr_obj.attr_name or f"attr_{rule.attr_id}"

            if rule.condition == "gt":
                thresh = rule.threshold_value or 0
                if raw > thresh:
                    triggered = True
                    triggered_value = float(raw)
                    message = f"{disk.name}: {label} = {raw} (threshold > {thresh})"

            elif rule.condition == "lt":
                thresh = rule.threshold_value or 0
                if raw < thresh:
                    triggered = True
                    triggered_value = float(raw)
                    message = f"{disk.name}: {label} = {raw} (threshold < {thresh})"

            elif rule.condition == "change":
                prev = self._prev_raw(disk.id, snapshot.id, rule.attr_id)
                if prev is not None and raw > prev:
                    triggered = True
                    triggered_value = float(raw)
                    message = f"{disk.name}: {label} increased {prev} → {raw}"

        if not triggered:
            return

        # Cooldown: skip if we already fired this rule for this disk recently.
        cutoff = utcnow() - timedelta(hours=_COOLDOWN_HOURS)
        if (
            self.db.query(models.AlertEvent)
            .filter(
                models.AlertEvent.rule_id == rule.id,
                models.AlertEvent.disk_id == disk.id,
                models.AlertEvent.triggered_at >= cutoff,
            )
            .first()
        ):
            return

        event = models.AlertEvent(
            rule_id=rule.id,
            disk_id=disk.id,
            disk_name=disk.name,
            attr_id=rule.attr_id,
            attr_name=attr_obj.attr_name if attr_obj else None,
            triggered_value=triggered_value,
            message=message,
            triggered_at=utcnow(),
        )
        self.db.add(event)
        self.db.flush()
        logger.warning("ALERT triggered: %s", message)

        if rule.notification_type in ("webhook", "both"):
            _fire_webhook(message, disk.name, rule.attr_id, triggered_value)

    def _prev_raw(
        self, disk_id: int, current_snapshot_id: int, attr_id: int
    ) -> int | None:
        prev_snap = (
            self.db.query(models.SmartSnapshot)
            .filter(
                models.SmartSnapshot.disk_id == disk_id,
                models.SmartSnapshot.id < current_snapshot_id,
            )
            .order_by(models.SmartSnapshot.id.desc())
            .first()
        )
        if prev_snap is None:
            return None
        prev_attr = (
            self.db.query(models.SmartAttribute)
            .filter(
                models.SmartAttribute.snapshot_id == prev_snap.id,
                models.SmartAttribute.attr_id == attr_id,
            )
            .first()
        )
        return prev_attr.raw_value if prev_attr else None


# ── Webhook ───────────────────────────────────────────────────────────────────

def _fire_webhook(
    message: str,
    disk_name: str,
    attr_id: int | None,
    value: float | None,
) -> None:
    url = settings.alert_webhook_url
    if not url:
        return
    payload = json.dumps(
        {
            "text": message,
            "disk": disk_name,
            "attr_id": attr_id,
            "value": value,
            "timestamp": utcnow().isoformat(),
        }
    ).encode()
    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Webhook → %s (%s)", url, resp.status)
    except Exception as exc:
        logger.error("Webhook delivery failed: %s", exc)


# ── Health score ──────────────────────────────────────────────────────────────

def compute_score(
    attrs: dict[int, models.SmartAttribute],
    overall_health: str | None,
) -> tuple[int, list[str]]:
    """Return (score 0–100, list of deduction reasons)."""
    score = 100
    deductions: list[str] = []

    # −20 if any critical attribute has raw_value > 0 (applied once)
    for aid in sorted(_CRITICAL_ATTR_IDS):
        a = attrs.get(aid)
        if a and a.raw_value and a.raw_value > 0:
            label = a.attr_name or f"attr_{aid}"
            deductions.append(f"{label} = {a.raw_value} (−20)")
            score -= 20
            break

    # −10 per degree above 45°C
    temp_attr = attrs.get(194) or attrs.get(190)
    if temp_attr and temp_attr.raw_value is not None:
        excess = temp_attr.raw_value - 45
        if excess > 0:
            penalty = excess * 10
            deductions.append(f"Temp {temp_attr.raw_value}°C (+{excess}° above 45°C, −{penalty})")
            score -= penalty

    # −5 if power-on hours > 30 000
    poh = attrs.get(9) or attrs.get(1005)
    if poh and poh.raw_value and poh.raw_value > 30_000:
        deductions.append(f"Power-on {poh.raw_value:,} h > 30 000 (−5)")
        score -= 5

    # Cap score if health is FAILED
    if overall_health == "FAILED":
        score = min(score, 20)
        deductions.append("Overall health FAILED (capped at 20)")

    return max(0, score), deductions
