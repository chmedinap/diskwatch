import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.database import SessionLocal
from app import models
from app.alerts import AlertEvaluator
from app.smart import SmartCollector, get_disk_usage
from app.utils import utcnow

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
                    disk = models.Disk(name=result.name, first_seen=utcnow())
                    db.add(disk)

                disk.model = result.model
                disk.serial = result.serial
                disk.firmware = result.firmware
                disk.interface = result.interface
                disk.capacity_gb = result.capacity_gb
                disk.last_seen = utcnow()
                usage = get_disk_usage(device)
                if usage is not None:
                    disk.used_bytes, disk.free_bytes, disk.mount_point = usage
                db.flush()

                snapshot = models.SmartSnapshot(
                    disk_id=disk.id,
                    timestamp=utcnow(),
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


def run_scheduled_tests() -> None:
    """Run any SMART self-tests that are due based on user-configured schedules."""
    db = SessionLocal()
    collector = SmartCollector(smartctl_path=settings.smartctl_path)
    now = utcnow()

    try:
        schedules = (
            db.query(models.TestSchedule)
            .filter(models.TestSchedule.enabled == True)  # noqa: E712
            .all()
        )
        for sched in schedules:
            if sched.last_run_at is None:
                due = True
            else:
                elapsed = (now - sched.last_run_at).total_seconds()
                due = elapsed >= sched.interval_hours * 3600

            if not due:
                continue

            disk = db.query(models.Disk).filter(models.Disk.id == sched.disk_id).first()
            if not disk:
                continue

            try:
                collector.run_self_test(disk.name, sched.test_type)
                sched.last_run_at = now
                logger.info("Triggered scheduled %s self-test on %s", sched.test_type, disk.name)
            except Exception:
                logger.exception("Scheduled %s test failed for %s", sched.test_type, disk.name)

        db.commit()
    except Exception:
        logger.exception("run_scheduled_tests aborted")
        db.rollback()
    finally:
        db.close()


def purge_old_snapshots() -> None:
    """Delete snapshots (and their attributes) older than snapshot_retention_days."""
    db = SessionLocal()
    cutoff = utcnow() - timedelta(days=settings.snapshot_retention_days)
    try:
        snap_ids = [
            row[0]
            for row in db.query(models.SmartSnapshot.id)
            .filter(models.SmartSnapshot.timestamp < cutoff)
            .all()
        ]
        if snap_ids:
            db.query(models.SmartAttribute).filter(
                models.SmartAttribute.snapshot_id.in_(snap_ids)
            ).delete(synchronize_session=False)
            db.query(models.SmartSnapshot).filter(
                models.SmartSnapshot.id.in_(snap_ids)
            ).delete(synchronize_session=False)
            db.commit()
            logger.info("Purged %d snapshots older than %d days", len(snap_ids), settings.snapshot_retention_days)
    except Exception:
        logger.exception("purge_old_snapshots aborted")
        db.rollback()
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone=settings.timezone)
    scheduler.add_job(
        run_scan,
        trigger=IntervalTrigger(minutes=settings.poll_interval_minutes),
        id="smart_scan",
        replace_existing=True,
        next_run_time=datetime.now() + timedelta(seconds=10),
    )
    scheduler.add_job(
        run_scheduled_tests,
        trigger=IntervalTrigger(minutes=30),
        id="scheduled_tests",
        replace_existing=True,
        next_run_time=datetime.now() + timedelta(seconds=30),
    )
    scheduler.add_job(
        purge_old_snapshots,
        trigger=IntervalTrigger(hours=24),
        id="purge_snapshots",
        replace_existing=True,
        next_run_time=datetime.now() + timedelta(minutes=5),
    )
    scheduler.start()
    logger.info("Scheduler started; poll interval = %d min", settings.poll_interval_minutes)
    return scheduler
