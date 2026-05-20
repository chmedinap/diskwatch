# DiskWatch

Self-hosted disk health monitoring using SMART data. Reads drive health via `smartctl`, stores historical snapshots in SQLite, and presents everything in a dark React dashboard.

![Docker](https://img.shields.io/badge/docker-martitoci%2Fdiskwatch-blue?logo=docker) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Auto-discovery** — detects all ATA and NVMe drives via `smartctl --scan`
- **SMART attributes** — full attribute table per disk, critical ones highlighted
- **Temperature gauge** — live SVG gauge + 30-day history chart per disk
- **Health score** — 0–100 score per disk based on critical attributes, temperature, and power-on hours
- **Attribute history** — multi-line overlay chart (7 / 30 / 90 days) for any combination of SMART attributes
- **Alert system** — configurable rules (threshold / change / health-failed) with optional webhook notifications
- **Self-test trigger** — run short or long SMART self-tests from the UI
- **Scheduled scans** — automatic scan every 30 minutes, manual trigger available

> **Linux host required for real disk access.**  
> The backend runs with `privileged: true` and mounts `/dev:/dev` so `smartctl` can read physical drives. On Windows/macOS Docker Desktop the stack starts fine but SMART data will not be available.

---

## Deployment

### Option 1 — Docker Compose (CLI)

**1. Create a `docker-compose.yml`:**

```yaml
services:
  backend:
    image: martitoci/diskwatch-backend:latest
    container_name: diskwatch-backend
    restart: unless-stopped
    privileged: true
    security_opt:
      - apparmor=unconfined
    environment:
      TZ: ${TZ:-UTC}
      DATABASE_URL: sqlite:////data/diskwatch.db
      ALERT_WEBHOOK_URL: ${ALERT_WEBHOOK_URL:-}
    volumes:
      - /dev:/dev
      - diskwatch_data:/data
    networks:
      - internal

  frontend:
    image: martitoci/diskwatch-frontend:latest
    container_name: diskwatch-frontend
    restart: unless-stopped
    ports:
      - "${DISKWATCH_PORT:-8080}:80"
    depends_on:
      - backend
    networks:
      - internal

volumes:
  diskwatch_data:

networks:
  internal:
    driver: bridge
```

**2. (Optional) Create a `.env` file to override defaults:**

```env
DISKWATCH_PORT=8080
TZ=America/Santiago
# ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

**3. Start:**

```bash
docker compose up -d
```

**4. Open the UI:** http://your-host:8080

Click **Scan now** on first launch to discover drives. The scheduler will then scan automatically every 30 minutes.

---

### Option 2 — Portainer (Stack)

Portainer lets you deploy and manage the stack from a web UI without touching the CLI.

**Step 1 — Open Portainer and go to Stacks → Add stack**

**Step 2 — Choose "Web editor" and paste the compose below:**

```yaml
services:
  backend:
    image: martitoci/diskwatch-backend:latest
    container_name: diskwatch-backend
    restart: unless-stopped
    privileged: true
    security_opt:
      - apparmor=unconfined
    environment:
      TZ: UTC
      DATABASE_URL: sqlite:////data/diskwatch.db
      ALERT_WEBHOOK_URL: ""
    volumes:
      - /dev:/dev
      - diskwatch_data:/data
    networks:
      - internal

  frontend:
    image: martitoci/diskwatch-frontend:latest
    container_name: diskwatch-frontend
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - backend
    networks:
      - internal

volumes:
  diskwatch_data:

networks:
  internal:
    driver: bridge
```

**Step 3 — Adjust environment variables** in the "Environment variables" section at the bottom of the form:

| Variable | Example value | Description |
|----------|--------------|-------------|
| `TZ` | `America/Santiago` | Timezone for timestamps |
| `ALERT_WEBHOOK_URL` | `https://hooks.slack.com/...` | Webhook for alert notifications (optional) |

**Step 4 — Click "Deploy the stack"**

**Step 5 — Open the UI:** http://your-host:8080

> **Tip:** To change the port, edit the `ports` line (`"8080:80"`) before deploying. The number on the left is the host port.

---

### Option 3 — Deploy from Git (Portainer)

If you want to track updates automatically from the repository:

1. Go to **Stacks → Add stack**
2. Choose **"Repository"**
3. Fill in:
   - Repository URL: `https://github.com/chmedinap/diskwatch`
   - Compose path: `docker-compose.yml`
4. Enable **"GitOps updates"** if you want Portainer to re-pull on git push
5. Click **"Deploy the stack"**

---

## Configuration

All configuration is done via environment variables — no files to edit inside the container.

| Variable | Default | Description |
|----------|---------|-------------|
| `DISKWATCH_PORT` | `8080` | Host port for the web UI |
| `TZ` | `UTC` | Timezone ([full list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) |
| `ALERT_WEBHOOK_URL` | _(empty)_ | URL to POST alert payloads to (Slack, Discord, n8n, etc.) |

---

## Alert rules

Six default rules are seeded automatically on first start:

| Rule | Condition |
|------|-----------|
| Temperature warning | Temperature_Celsius (attr 194) > 55°C |
| Airflow temperature warning | Airflow_Temp (attr 190) > 55°C |
| Reallocated sectors | attr 5 increases (any reallocation event) |
| Pending sectors | attr 197 > 0 |
| Uncorrectable sectors | attr 198 > 0 |
| Drive health failed | overall\_health = FAILED |

Rules and events are managed from the **Alerts** tab in the UI. Custom rules can target individual drives or all drives.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Overall system summary |
| `GET` | `/api/disks` | List all disks |
| `GET` | `/api/disks/{id}` | Disk detail + latest SMART attributes |
| `GET` | `/api/disks/{id}/temperature/history?days=N` | Temperature history |
| `GET` | `/api/disks/{id}/history?attr=194&days=30` | Single attribute history |
| `GET` | `/api/disks/{id}/score` | Health score breakdown |
| `POST` | `/api/disks/{id}/test/{type}` | Trigger `short` or `long` self-test |
| `POST` | `/api/scan` | Trigger an immediate full scan |
| `GET` | `/api/alerts/rules` | List alert rules |
| `POST` | `/api/alerts/rules` | Create alert rule |
| `PATCH` | `/api/alerts/rules/{id}` | Update rule |
| `DELETE` | `/api/alerts/rules/{id}` | Delete rule |
| `GET` | `/api/alerts/events` | List alert events |
| `PATCH` | `/api/alerts/events/{id}/acknowledge` | Acknowledge event |
| `POST` | `/api/alerts/events/acknowledge-all` | Acknowledge all |
| `DELETE` | `/api/alerts/events/{id}` | Delete event |

---

## Data persistence

SMART history is stored in a named Docker volume (`diskwatch_data`). The volume survives container restarts and updates.

**To back up the database:**

```bash
docker run --rm \
  -v diskwatch_diskwatch_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/diskwatch.db /backup/diskwatch.db
```

**To update to a new version without losing data:**

```bash
docker compose pull
docker compose up -d
```

The volume is untouched — only the containers are replaced.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI · Python 3.12 · SQLAlchemy 2 · APScheduler |
| Frontend | React 19 · TypeScript · Vite · Recharts |
| Storage | SQLite (named Docker volume) |
| SMART | `smartmontools` 7.4 (inside the privileged container) |

---

## License

MIT
