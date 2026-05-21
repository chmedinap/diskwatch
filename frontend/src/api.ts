const BASE = import.meta.env.VITE_API_URL ?? "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiskListItem {
  id: number;
  name: string;
  model: string | null;
  serial: string | null;
  interface: string | null;
  capacity_gb: number | null;
  overall_health: string | null;
  last_seen: string;
  last_snapshot_at: string | null;
  used_bytes: number | null;
  free_bytes: number | null;
}

export interface SmartAttribute {
  id: number;
  snapshot_id: number;
  attr_id: number;
  attr_name: string | null;
  value: number | null;
  worst: number | null;
  threshold: number | null;
  raw_value: number | null;
  flags: string | null;
}

export interface SnapshotRead {
  id: number;
  disk_id: number;
  timestamp: string;
  overall_health: string | null;
}

export interface DiskDetail {
  id: number;
  name: string;
  model: string | null;
  serial: string | null;
  firmware: string | null;
  interface: string | null;
  capacity_gb: number | null;
  first_seen: string;
  last_seen: string;
  latest_snapshot: SnapshotRead | null;
  attributes: SmartAttribute[];
  used_bytes: number | null;
  free_bytes: number | null;
}

export interface TemperaturePoint {
  timestamp: string;
  temperature: number;
}

export interface AttributeHistoryPoint {
  timestamp: string;
  value: number | null;
  raw_value: number | null;
}

export interface AttributeHistory {
  disk_id: number;
  attr_id: number;
  attr_name: string | null;
  data: AttributeHistoryPoint[];
}

export interface HealthSummary {
  total_disks: number;
  healthy: number;
  failed: number;
  unknown: number;
  last_scan_at: string | null;
  unacknowledged_alerts: number;
}

export interface AlertRule {
  id: number;
  name: string;
  disk_id: number | null;
  attr_id: number | null;
  condition: string;
  threshold_value: number | null;
  notification_type: string;
  enabled: boolean;
  created_at: string;
}

export interface AlertRuleCreate {
  name: string;
  disk_id?: number | null;
  attr_id?: number | null;
  condition: string;
  threshold_value?: number | null;
  notification_type?: string;
  enabled?: boolean;
}

export interface AlertEvent {
  id: number;
  rule_id: number;
  disk_id: number;
  disk_name: string;
  attr_id: number | null;
  attr_name: string | null;
  triggered_value: number | null;
  message: string;
  triggered_at: string;
  acknowledged: boolean;
}

// ── Auth types ─────────────────────────────────────────────────────────────────

export interface AuthStatus { setup_required: boolean; }
export interface AuthToken { access_token: string; username: string; }
export interface AuthMe { username: string; }

export interface TestSchedule {
  id: number;
  disk_id: number;
  test_type: string;
  interval_hours: number;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface SelfTestLogEntry {
  test_type: string;
  status: string;
  passed: boolean | null;
  lifetime_hours: number | null;
  lba_of_first_error: number | null;
}

export interface SelfTestLog {
  disk_id: number;
  entries: SelfTestLogEntry[];
}

// ── Token storage ─────────────────────────────────────────────────────────────

const TOKEN_KEY = "diskwatch_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Fired when any authenticated request returns 401 so App.tsx can react.
export const onUnauthorized: { handler: (() => void) | null } = { handler: null };

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (res.status === 401) { onUnauthorized.handler?.(); throw new Error("401"); }
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(body !== undefined ? { "Content-Type": "application/json" } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { onUnauthorized.handler?.(); throw new Error("401"); }
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (res.status === 401) { onUnauthorized.handler?.(); throw new Error("401"); }
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (res.status === 401) { onUnauthorized.handler?.(); throw new Error("401"); }
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) { onUnauthorized.handler?.(); throw new Error("401"); }
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}

// ── Disk / SMART calls ────────────────────────────────────────────────────────

export const fetchHealth = () => get<HealthSummary>("/health");
export const fetchDisks = () => get<DiskListItem[]>("/disks/");
export const fetchDisk = (id: number) => get<DiskDetail>(`/disks/${id}`);
export const fetchTemperatureHistory = (id: number, days = 30) =>
  get<TemperaturePoint[]>(`/disks/${id}/temperature/history?days=${days}`);
export const fetchAttributeHistory = (id: number, attr: number, days = 30) =>
  get<AttributeHistory>(`/disks/${id}/history?attr=${attr}&days=${days}`);
export const deleteDisk = (id: number) => del(`/disks/${id}`);
export const fetchSelfTestLog = (id: number) => get<SelfTestLog>(`/disks/${id}/test/log`);

export const triggerScan = () => post<{ scanned: string[] }>("/scan/");
export const triggerTest = (diskId: number, testType: "short" | "long") =>
  post<{ device: string; test_type: string; message: string }>(`/disks/${diskId}/test/${testType}`);

// ── Alert calls ───────────────────────────────────────────────────────────────

export const fetchAlertRules = () => get<AlertRule[]>("/alerts/rules");
export const createAlertRule = (body: AlertRuleCreate) =>
  post<AlertRule>("/alerts/rules", body);
export const updateAlertRule = (id: number, body: Partial<AlertRuleCreate>) =>
  patch<AlertRule>(`/alerts/rules/${id}`, body);
export const deleteAlertRule = (id: number) => del(`/alerts/rules/${id}`);

export const fetchAlertEvents = (opts?: {
  diskId?: number;
  unacknowledgedOnly?: boolean;
  limit?: number;
}) => {
  const params = new URLSearchParams();
  if (opts?.diskId != null) params.set("disk_id", String(opts.diskId));
  if (opts?.unacknowledgedOnly) params.set("unacknowledged_only", "true");
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<AlertEvent[]>(`/alerts/events${qs ? `?${qs}` : ""}`);
};

export const acknowledgeEvent = (id: number) =>
  patch<AlertEvent>(`/alerts/events/${id}/acknowledge`, {});
export const acknowledgeAllEvents = () =>
  post<void>("/alerts/events/acknowledge-all");
export const deleteAlertEvent = (id: number) => del(`/alerts/events/${id}`);

// ── Utilities shared by components ───────────────────────────────────────────

export function tempColor(t: number | null | undefined): string {
  if (t == null) return "#94a3b8";
  if (t >= 55) return "#ef4444";
  if (t >= 45) return "#f59e0b";
  return "#22c55e";
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const gb = bytes / 1e9;
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

export function formatCapacity(gb: number | null): string {
  if (gb == null) return "—";
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  return `${Math.round(gb)} GB`;
}

export function formatHours(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 730) return `${days.toLocaleString()} days`;
  return `${(h / 8760).toFixed(1)} yrs`;
}

export function attrRaw(attrs: SmartAttribute[], ...ids: number[]): number | null {
  for (const id of ids) {
    const a = attrs.find((x) => x.attr_id === id);
    if (a?.raw_value != null) return a.raw_value;
  }
  return null;
}

// Critical attribute IDs (reallocated, reported uncorrect, command timeout,
// pending, offline uncorrectable).
const CRITICAL_IDS = new Set([5, 187, 188, 197, 198]);

export interface HealthScoreResult {
  score: number;
  deductions: string[];
}

/** Compute the 0–100 health score from already-loaded attribute data. */
export function computeHealthScore(
  attrs: SmartAttribute[],
  overallHealth: string | null,
): HealthScoreResult {
  let score = 100;
  const deductions: string[] = [];
  const attrMap = new Map(attrs.map((a) => [a.attr_id, a]));

  // −20 if any critical attribute has raw_value > 0 (penalty applied once)
  for (const id of CRITICAL_IDS) {
    const a = attrMap.get(id);
    if (a?.raw_value && a.raw_value > 0) {
      deductions.push(`${a.attr_name ?? `Attr #${id}`} = ${a.raw_value} (−20)`);
      score -= 20;
      break;
    }
  }

  // −10 per degree above 45°C
  const tempAttr = attrMap.get(194) ?? attrMap.get(190);
  if (tempAttr?.raw_value != null) {
    const excess = tempAttr.raw_value - 45;
    if (excess > 0) {
      const penalty = excess * 10;
      deductions.push(`Temp ${tempAttr.raw_value}°C (+${excess}° above 45°C, −${penalty})`);
      score -= penalty;
    }
  }

  // −5 if power-on hours > 30 000
  const pohAttr = attrMap.get(9) ?? attrMap.get(1005);
  if (pohAttr?.raw_value != null && pohAttr.raw_value > 30_000) {
    deductions.push(`Power-on ${pohAttr.raw_value.toLocaleString()} h > 30 000 (−5)`);
    score -= 5;
  }

  // Cap at 20 if health is FAILED
  if (overallHealth === "FAILED") {
    score = Math.min(score, 20);
    deductions.push("Overall health FAILED (score capped at 20)");
  }

  return { score: Math.max(0, score), deductions };
}

// ── Auth calls (no token needed) ──────────────────────────────────────────────

export const fetchAuthStatus = () =>
  fetch(`${BASE}/auth/status`).then((r) => r.json() as Promise<AuthStatus>);

export const authSetup = (username: string, password: string) =>
  fetch(`${BASE}/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json()).detail ?? "Setup failed");
    return r.json() as Promise<AuthToken>;
  });

export const authLogin = (username: string, password: string) =>
  fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json()).detail ?? "Invalid credentials");
    return r.json() as Promise<AuthToken>;
  });

export const fetchMe = () => get<AuthMe>("/auth/me");

export const changePassword = (currentPassword: string, newPassword: string) =>
  post<void>("/auth/password", { current_password: currentPassword, new_password: newPassword });

// ── Schedule calls ────────────────────────────────────────────────────────────

export const fetchSchedules = (diskId: number) =>
  get<TestSchedule[]>(`/disks/${diskId}/schedules`);

export const upsertSchedule = (
  diskId: number,
  testType: "short" | "long",
  intervalHours: number,
  enabled: boolean,
) => put<TestSchedule>(`/disks/${diskId}/schedules/${testType}`, { interval_hours: intervalHours, enabled });

export const deleteSchedule = (diskId: number, testType: "short" | "long") =>
  del(`/disks/${diskId}/schedules/${testType}`);

/** Condition label for display in the UI. */
export function conditionLabel(rule: AlertRule): string {
  const attr = rule.attr_id != null ? `attr #${rule.attr_id}` : "health";
  const thresh = rule.threshold_value != null ? rule.threshold_value : "";
  switch (rule.condition) {
    case "gt": return `${attr} > ${thresh}`;
    case "lt": return `${attr} < ${thresh}`;
    case "change": return `${attr} increases`;
    case "failed": return "overall_health = FAILED";
    default: return rule.condition;
  }
}
