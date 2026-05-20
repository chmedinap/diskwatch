import glob
import json
import logging
import subprocess
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# NVMe health log fields mapped to synthetic attr_ids for uniform storage.
# attr_id 194 is reused for temperature to align with the ATA convention so
# temperature history queries work across both drive types without special-casing.
_NVME_ATTR_MAP: list[tuple[int, str, str]] = [
    (194,  "Temperature_Celsius",       "temperature"),
    (1001, "Available_Spare_Pct",       "available_spare"),
    (1002, "Available_Spare_Threshold", "available_spare_threshold"),
    (1003, "Percentage_Used",           "percentage_used"),
    (1004, "Media_Errors",              "media_errors"),
    (1005, "Power_On_Hours",            "power_on_hours"),
    (1006, "Power_Cycles",              "power_cycles"),
    (1007, "Unsafe_Shutdowns",          "unsafe_shutdowns"),
    (1008, "Data_Units_Read",           "data_units_read"),
    (1009, "Data_Units_Written",        "data_units_written"),
]


@dataclass
class AttributeRow:
    attr_id: int
    attr_name: str | None
    value: int | None
    worst: int | None
    threshold: int | None
    raw_value: int | None
    flags: str | None


@dataclass
class CollectionResult:
    name: str
    model: str | None
    serial: str | None
    firmware: str | None
    interface: str | None
    capacity_gb: float | None
    overall_health: str | None
    raw_json: str
    attributes: list[AttributeRow] = field(default_factory=list)


class SmartCollector:
    def __init__(self, smartctl_path: str = "/usr/sbin/smartctl") -> None:
        self.smartctl_path = smartctl_path

    # ------------------------------------------------------------------
    # Device discovery
    # ------------------------------------------------------------------

    def detect_devices(self) -> list[str]:
        """Return a list of block-device paths to scan.

        Prefers ``smartctl --scan`` output; falls back to globbing common paths
        so the collector still works even if smartctl exits non-zero.
        """
        devices: list[str] = []
        try:
            result = subprocess.run(
                [self.smartctl_path, "--scan", "-j"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            data = json.loads(result.stdout)
            devices = [d["name"] for d in data.get("devices", [])]
        except Exception as exc:
            logger.warning("smartctl --scan failed (%s); falling back to glob", exc)

        if not devices:
            devices = sorted(
                glob.glob("/dev/sd?")
                + glob.glob("/dev/nvme[0-9]n[0-9]")
            )

        return devices

    # ------------------------------------------------------------------
    # Data collection
    # ------------------------------------------------------------------

    def collect(self, device: str) -> CollectionResult | None:
        """Run ``smartctl -A -i -H --json`` on *device* and return parsed data."""
        try:
            proc = subprocess.run(
                [self.smartctl_path, "-A", "-i", "-H", "--json", device],
                capture_output=True,
                text=True,
                timeout=30,
            )
            data = json.loads(proc.stdout)
        except Exception as exc:
            logger.error("smartctl failed for %s: %s", device, exc)
            return None

        dev_info = data.get("device", {})
        interface = dev_info.get("type") or dev_info.get("protocol") or None

        health_node = data.get("smart_status", {})
        if "passed" in health_node:
            overall_health = "PASSED" if health_node["passed"] else "FAILED"
        else:
            overall_health = None

        cap = data.get("user_capacity", {}).get("bytes")
        capacity_gb = round(cap / 1e9, 1) if cap else None

        is_nvme = interface and "nvme" in interface.lower()
        attributes = (
            self._parse_nvme_attributes(data)
            if is_nvme
            else self._parse_ata_attributes(data)
        )

        return CollectionResult(
            name=device,
            model=data.get("model_name"),
            serial=data.get("serial_number"),
            firmware=data.get("firmware_version"),
            interface=interface,
            capacity_gb=capacity_gb,
            overall_health=overall_health,
            raw_json=json.dumps(data),
            attributes=attributes,
        )

    # ------------------------------------------------------------------
    # Self-test trigger
    # ------------------------------------------------------------------

    def run_self_test(self, device: str, test_type: str) -> dict:
        """Initiate a SMART self-test. *test_type* must be ``'short'`` or ``'long'``."""
        if test_type not in ("short", "long"):
            raise ValueError(f"Unknown test type: {test_type!r}")
        proc = subprocess.run(
            [self.smartctl_path, "-t", test_type, "--json", device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        try:
            return json.loads(proc.stdout)
        except Exception:
            return {}

    # ------------------------------------------------------------------
    # Attribute parsers
    # ------------------------------------------------------------------

    def _parse_ata_attributes(self, data: dict) -> list[AttributeRow]:
        rows: list[AttributeRow] = []
        for attr in data.get("ata_smart_attributes", {}).get("table", []):
            flags_node = attr.get("flags", {})
            flags_str = flags_node.get("string") if isinstance(flags_node, dict) else str(flags_node)
            rows.append(AttributeRow(
                attr_id=attr["id"],
                attr_name=attr.get("name"),
                value=attr.get("value"),
                worst=attr.get("worst"),
                threshold=attr.get("thresh"),
                raw_value=attr.get("raw", {}).get("value"),
                flags=flags_str or None,
            ))
        return rows

    def _parse_nvme_attributes(self, data: dict) -> list[AttributeRow]:
        log = data.get("nvme_smart_health_information_log", {})
        rows: list[AttributeRow] = []
        for attr_id, attr_name, key in _NVME_ATTR_MAP:
            raw = log.get(key)
            if raw is None:
                continue
            rows.append(AttributeRow(
                attr_id=attr_id,
                attr_name=attr_name,
                value=None,
                worst=None,
                threshold=None,
                raw_value=int(raw),
                flags=None,
            ))
        return rows
