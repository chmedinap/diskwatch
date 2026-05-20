from datetime import datetime

from pydantic import BaseModel


# ── Disk / SMART ──────────────────────────────────────────────────────────────

class SmartAttributeRead(BaseModel):
    id: int
    snapshot_id: int
    attr_id: int
    attr_name: str | None
    value: int | None
    worst: int | None
    threshold: int | None
    raw_value: int | None
    flags: str | None

    model_config = {"from_attributes": True}


class SnapshotRead(BaseModel):
    id: int
    disk_id: int
    timestamp: datetime
    overall_health: str | None

    model_config = {"from_attributes": True}


class DiskListItem(BaseModel):
    id: int
    name: str
    model: str | None
    serial: str | None
    interface: str | None
    capacity_gb: float | None
    overall_health: str | None
    last_seen: datetime
    last_snapshot_at: datetime | None


class DiskDetail(BaseModel):
    id: int
    name: str
    model: str | None
    serial: str | None
    firmware: str | None
    interface: str | None
    capacity_gb: float | None
    first_seen: datetime
    last_seen: datetime
    latest_snapshot: SnapshotRead | None
    attributes: list[SmartAttributeRead]


class AttributeHistoryPoint(BaseModel):
    timestamp: datetime
    value: int | None
    raw_value: int | None


class AttributeHistory(BaseModel):
    disk_id: int
    attr_id: int
    attr_name: str | None
    data: list[AttributeHistoryPoint]


class TemperaturePoint(BaseModel):
    timestamp: datetime
    temperature: float


class HealthSummary(BaseModel):
    total_disks: int
    healthy: int
    failed: int
    unknown: int
    last_scan_at: datetime | None
    unacknowledged_alerts: int


class HealthScore(BaseModel):
    disk_id: int
    score: int  # 0–100
    deductions: list[str]


class TestResult(BaseModel):
    device: str
    test_type: str
    message: str


# ── Alert rules ───────────────────────────────────────────────────────────────

class AlertRuleCreate(BaseModel):
    name: str
    disk_id: int | None = None
    attr_id: int | None = None
    condition: str          # gt | lt | change | failed
    threshold_value: float | None = None
    notification_type: str = "log"   # log | webhook | both
    enabled: bool = True


class AlertRuleRead(AlertRuleCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    threshold_value: float | None = None
    notification_type: str | None = None


# ── Alert events ──────────────────────────────────────────────────────────────

class AlertEventRead(BaseModel):
    id: int
    rule_id: int
    disk_id: int
    disk_name: str
    attr_id: int | None
    attr_name: str | None
    triggered_value: float | None
    message: str
    triggered_at: datetime
    acknowledged: bool

    model_config = {"from_attributes": True}
