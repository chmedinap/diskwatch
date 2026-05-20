from fastapi import APIRouter

from app.scheduler import run_scan

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("/", summary="Trigger an immediate SMART scan of all detected disks")
def trigger_scan():
    scanned = run_scan()
    return {"scanned": scanned}
