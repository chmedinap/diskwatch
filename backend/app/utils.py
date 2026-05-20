from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current UTC time as a naive datetime (compatible with SQLite storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
