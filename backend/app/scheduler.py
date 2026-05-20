import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.database import SessionLocal
from app import models
from app.alerts import AlertEvaluator
from app.smart import SmartCollector

logger = logging.getLogger(__name__)


def run_scan() -> list[str]:
    """Collect SMART data from all detected disks, evaluate alerts, return scanned names."""
    collector = SmartCollector(smartctl_path=settings.smartctl_path)
    db = SessionLocal()
    scanned: list[str] = []

    try:
        devices = collector.detect_devices()
        logger.info("Starting SMART scan of %d device(s): %s", len(devices), devices)
        evaluator = AlertEvaluator(db)

        for device in devices:
            try:
                result = collector.collect(device)
                if result is None:
                    continue

                disk = db.query(models.Disk).filter(models.Disk.name == result.name).first()
                if not disk:
                    disk = models.Disk(name=result.name, first_seen=datetime.utcnow())
                    db.add(disk)

                disk.model = result.model
                disk.serial = result.serial
                disk.firmware = result.firmware
                disk.interface = result.interface
                disk.capacity_gb = result.capacity_gb
                disk.last_seen = datetime.utcnow()
                db.flush()

                snapshot = models.SmartSnapshot(
                    disk_id=disk.id,
                    timestamp=datetime.utcnow(),
                    overall_health=result.overall_health,
                    raw_json=result.raw_json,
                )
                db.add(snapshot)
                db.flush()

                for attr in result.attributes:
                    db.add(models.SmartAttribute(
                        snapshot_id=snapshot.id,
                        attr_id=attr.attr_id,
                        attr_name=attr.attr_name,
                        value=attr.value,
                        worst=attr.worst,
                        threshold=attr.threshold,
                        raw_value=attr.raw_value,
                        flags=attr.flags,
                    ))
                db.flush()

                # Evaluate alert rules against the new snapshot.
                try:
                    evaluator.evaluate(disk, snapshot)
                except Exception:
                    logger.exception("Alert evaluation failed for %s", device)

                scanned.append(device)
                logger.info(
                    "Collected %s: health=%s attrs=%d",
                    device, result.overall_health, len(result.attributes),
                )

            except Exception:
                logger.exception("Failed to collect %s", device)

        db.commit()

    except Exception:
        logger.exception("SMART scan aborted")
        db.rollback()

    finally:
        db.close()

    logger.info("Scan complete. Scanned: %s", scanned)
    return scanned


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone=settings.timezone)
    scheduler.add_job(
        run_scan,
        trigger=IntervalTrigger(minutes=settings.poll_interval_minutes),
        id="smart_scan",
        replace_existing=True,
        next_run_time=datetime.now() + timedelta(seconds=10),
    )
    scheduler.start()
    logger.info("Scheduler started; poll interval = %d min", settings.poll_interval_minutes)
    return scheduler
