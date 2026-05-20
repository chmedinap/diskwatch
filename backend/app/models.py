from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.utils import utcnow


class Disk(Base):
    __tablename__ = "disks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    serial: Mapped[str | None] = mapped_column(String(128), nullable=True)
    firmware: Mapped[str | None] = mapped_column(String(64), nullable=True)
    interface: Mapped[str | None] = mapped_column(String(16), nullable=True)
    capacity_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SmartSnapshot(Base):
    __tablename__ = "smart_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    disk_id: Mapped[int] = mapped_column(Integer, ForeignKey("disks.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    overall_health: Mapped[str | None] = mapped_column(String(16), nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class SmartAttribute(Base):
    __tablename__ = "smart_attributes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    snapshot_id: Mapped[int] = mapped_column(Integer, ForeignKey("smart_snapshots.id"), index=True)
    attr_id: Mapped[int] = mapped_column(Integer)
    attr_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    worst: Mapped[int | None] = mapped_column(Integer, nullable=True)
    threshold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    flags: Mapped[str | None] = mapped_column(String(32), nullable=True)

    __table_args__ = (
        Index("ix_smart_attributes_snapshot_attr", "snapshot_id", "attr_id"),
    )


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    # NULL disk_id means "apply to all disks"
    disk_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("disks.id"), nullable=True, index=True
    )
    # NULL attr_id means check overall_health (used with condition="failed")
    attr_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # gt | lt | change | failed
    condition: Mapped[str] = mapped_column(String(16))
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # log | webhook | both
    notification_type: Mapped[str] = mapped_column(String(16), default="log")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TestSchedule(Base):
    __tablename__ = "test_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    disk_id: Mapped[int] = mapped_column(Integer, ForeignKey("disks.id"), index=True)
    test_type: Mapped[str] = mapped_column(String(8))       # "short" | "long"
    interval_hours: Mapped[int] = mapped_column(Integer)    # 1–24
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (UniqueConstraint("disk_id", "test_type"),)


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    rule_id: Mapped[int] = mapped_column(Integer, ForeignKey("alert_rules.id"), index=True)
    disk_id: Mapped[int] = mapped_column(Integer, ForeignKey("disks.id"), index=True)
    disk_name: Mapped[str] = mapped_column(String(64))
    attr_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attr_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    triggered_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    message: Mapped[str] = mapped_column(String(512))
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
