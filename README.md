# DiskWatch

Self-hosted disk health monitoring using SMART data. Reads drive health via `smartctl`, stores historical snapshots in SQLite, and presents everything in a dark React dashboard.

![Dashboard](https://img.shields.io/badge/status-stable-brightgreen) ![Docker](https://img.shields.io/badge/docker-ready-blue) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Auto-discovery** — detects all ATA and NVMe drives via `smartctl --scan`
- **SMART attributes** — full attribute table per disk, critical ones highlighted
- **Temperature gauge** — live SVG gauge + 30-day history chart per disk
- **Health score** — 0–100 score per disk based on critical attributes, temperature, and power-on hours
- **Attribute history** — multi-line overlay chart (7 / 30 / 90 days) for any combination of SMART attributes
- **Alert system** — configurable rules (threshold / change / health-failed) with optional webhook notifications
- **Self-test trigger** — run short or long SMART self-tests from the UI
- **Scheduled scans** — automatic scan every 30 minutes, manual trigger available

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI · Python 3.12 · SQLAlchemy 2 · APScheduler |
| Frontend | React 19 · TypeScript · Vite · Recharts |
| Storage | SQLite (named Docker volume) |
| SMART | `smartmontools` 7.4 (inside the privileged container) |

## Quick start

```bash
# Pull and start (replace X.Y.Z with the latest tag)
docker compose up -d
```

The UI is available at **http://localhost:8080** by default.  
Click **Scan now** on first launch to discover your drives.

> **Linux host required for real disk access.**  
> The backend container runs with `privileged: true` and mounts `/dev:/dev` so that `smartctl` can read physical drives. On Windows/macOS Docker Desktop the container starts fine but SMART data will not be available.

## Configuration

Copy `.env.example` to `.env` and edit as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DISKWATCH_PORT` | `8080` | Host port for the web UI |
| `TZ` | `UTC` | Timezone for timestamps and the scheduler |
| `ALERT_WEBHOOK_URL` | _(empty)_ | Optional URL to POST alert payloads to |

## Alert rules

Six default rules are seeded on first start:

| Rule | Condition |
|------|-----------|
| Temperature warning | attr 194 (Temperature_Celsius) > 55 |
| Airflow temperature warning | attr 190 (Airflow_Temp) > 55 |
| Reallocated sectors | attr 5 changes (any reallocation) |
| Pending sectors | attr 197 > 0 |
| Uncorrectable sectors | attr 198 > 0 |
| Drive health failed | overall\_health = FAILED |

Rules and events are managed from the **Alerts** tab in the UI.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Overall system summary |
| `GET` | `/api/disks` | List all disks |
| `GET` | `/api/disks/{id}` | Disk detail + latest SMART attributes |
| `GET` | `/api/disks/{id}/temperature/history?days=N` | Temperature history |
| `GET` | `/api/disks/{id}/history?attr=194&days=30` | Attribute history |
| `GET` | `/api/disks/{id}/score` | Health score breakdown |
| `POST` | `/api/disks/{id}/test/{type}` | Trigger short/long self-test |
| `POST` | `/api/scan` | Trigger an immediate full scan |
| `GET` | `/api/alerts/rules` | List alert rules |
| `POST` | `/api/alerts/rules` | Create alert rule |
| `PATCH` | `/api/alerts/rules/{id}` | Update rule |
| `DELETE` | `/api/alerts/rules/{id}` | Delete rule |
| `GET` | `/api/alerts/events` | List alert events |
| `PATCH` | `/api/alerts/events/{id}/acknowledge` | Acknowledge event |
| `POST` | `/api/alerts/events/acknowledge-all` | Acknowledge all |
| `DELETE` | `/api/alerts/events/{id}` | Delete event |

## Project layout

```
diskwatch/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + lifespan
│   │   ├── config.py        # Pydantic settings
│   │   ├── database.py      # SQLAlchemy engine / session
│   │   ├── models.py        # ORM models (Disk, SmartSnapshot, SmartAttribute, AlertRule, AlertEvent)
│   │   ├── schemas.py       # Pydantic response/request schemas
│   │   ├── smart.py         # smartctl wrapper (ATA + NVMe)
│   │   ├── alerts.py        # Alert evaluation + webhook + health score
│   │   ├── scheduler.py     # APScheduler background job
│   │   └── routers/
│   │       ├── disks.py
│   │       ├── alerts.py
│   │       ├── health.py
│   │       └── scan.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Root: routing + header nav
│   │   ├── api.ts            # API client + client-side health score
│   │   └── components/
│   │       ├── DiskCard.tsx        # Dashboard card with sparkline + health score
│   │       ├── DiskDetail.tsx      # Detail view (overview + history tabs)
│   │       ├── AttributesTable.tsx # SMART attributes table
│   │       ├── HealthScore.tsx     # Colored progress bar + deduction tooltip
│   │       ├── HistoryChart.tsx    # Multi-attribute overlay chart
│   │       ├── AlertsPage.tsx      # Rules + events management
│   │       ├── SnapshotChart.tsx   # 30-day temperature line chart
│   │       └── TempSparkline.tsx   # 7-day mini sparkline
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Data persistence

SMART data is stored in a named Docker volume (`diskwatch_data`). To back up or inspect the database:

```bash
# Copy the DB out of the volume
docker run --rm -v diskwatch_diskwatch_data:/data -v $(pwd):/backup alpine \
  cp /data/diskwatch.db /backup/diskwatch.db
```

## License

MIT
