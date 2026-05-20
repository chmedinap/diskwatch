import { useCallback, useEffect, useState } from "react";
import type { AlertRule, AlertEvent, AlertRuleCreate } from "../api";
import {
  fetchAlertRules,
  fetchAlertEvents,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  acknowledgeEvent,
  acknowledgeAllEvents,
  deleteAlertEvent,
  conditionLabel,
} from "../api";

// ── Tab type ──────────────────────────────────────────────────────────────────

type Tab = "rules" | "events";

// ── Main component ─────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [tab, setTab] = useState<Tab>("events");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([fetchAlertRules(), fetchAlertEvents()]);
      setRules(r);
      setEvents(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleRule = async (rule: AlertRule) => {
    const updated = await updateAlertRule(rule.id, { enabled: !rule.enabled });
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
  };

  const removeRule = async (id: number) => {
    await deleteAlertRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const ackEvent = async (id: number) => {
    const updated = await acknowledgeEvent(id);
    setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
  };

  const ackAll = async () => {
    await acknowledgeAllEvents();
    setEvents((prev) => prev.map((e) => ({ ...e, acknowledged: true })));
  };

  const removeEvent = async (id: number) => {
    await deleteAlertEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const onRuleCreated = (rule: AlertRule) => {
    setRules((prev) => [...prev, rule]);
    setShowAdd(false);
  };

  const unread = events.filter((e) => !e.acknowledged).length;

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ fontWeight: 700, fontSize: "1.1rem" }}>Alerts</h2>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.25rem" }}>
        <TabBtn label="Events" badge={unread || undefined} active={tab === "events"} onClick={() => setTab("events")} />
        <TabBtn label="Rules" active={tab === "rules"} onClick={() => setTab("rules")} />
      </div>

      {loading && <p style={{ color: "#475569" }}>Loading…</p>}

      {/* ── Events tab ── */}
      {tab === "events" && !loading && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
            {unread > 0 && (
              <button onClick={ackAll} style={ghostBtnStyle}>
                Acknowledge all ({unread})
              </button>
            )}
          </div>

          {events.length === 0 && (
            <p style={{ color: "#475569" }}>No alert events yet.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {events.map((ev) => (
              <EventRow
                key={ev.id}
                event={ev}
                onAck={() => void ackEvent(ev.id)}
                onDelete={() => void removeEvent(ev.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Rules tab ── */}
      {tab === "rules" && !loading && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
            <button
              onClick={() => setShowAdd((v) => !v)}
              style={{
                background: "#1d4ed8",
                color: "#eff6ff",
                border: "none",
                borderRadius: 7,
                padding: "0.4rem 0.9rem",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              {showAdd ? "Cancel" : "+ Add rule"}
            </button>
          </div>

          {showAdd && <AddRuleForm onCreated={onRuleCreated} />}

          {rules.length === 0 && !showAdd && (
            <p style={{ color: "#475569" }}>No rules defined.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={() => void toggleRule(rule)}
                onDelete={() => void removeRule(rule.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Rule row ───────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onToggle,
  onDelete,
}: {
  rule: AlertRule;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: "#1e293b",
        border: `1px solid ${rule.enabled ? "#1e3a5f" : "#334155"}`,
        borderRadius: 8,
        padding: "0.75rem 1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        opacity: rule.enabled ? 1 : 0.55,
      }}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        title={rule.enabled ? "Disable" : "Enable"}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          border: "none",
          background: rule.enabled ? "#22c55e" : "#475569",
          cursor: "pointer",
          position: "relative",
          flexShrink: 0,
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: rule.enabled ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
          }}
        />
      </button>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{rule.name}</div>
        <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: 1 }}>
          {conditionLabel(rule)}
          {" · "}
          {rule.disk_id != null ? `Disk #${rule.disk_id}` : "All disks"}
          {" · "}
          <span style={{ color: rule.notification_type === "log" ? "#64748b" : "#38bdf8" }}>
            {rule.notification_type}
          </span>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Delete rule"
        style={{
          background: "none",
          border: "none",
          color: "#475569",
          cursor: "pointer",
          fontSize: "1rem",
          padding: "0 0.25rem",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({
  event,
  onAck,
  onDelete,
}: {
  event: AlertEvent;
  onAck: () => void;
  onDelete: () => void;
}) {
  const ts = new Date(event.triggered_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background: "#1e293b",
        border: `1px solid ${event.acknowledged ? "#1e293b" : "#7f1d1d"}`,
        borderLeft: `3px solid ${event.acknowledged ? "#334155" : "#ef4444"}`,
        borderRadius: 8,
        padding: "0.65rem 1rem",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        opacity: event.acknowledged ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.82rem", fontWeight: event.acknowledged ? 400 : 600 }}>
          {event.message}
        </div>
        <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: 3 }}>
          {ts}
          {event.triggered_value != null && (
            <> · value: <span style={{ color: "#e2e8f0" }}>{event.triggered_value}</span></>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
        {!event.acknowledged && (
          <button onClick={onAck} style={{ ...ghostBtnStyle, fontSize: "0.72rem" }}>
            Ack
          </button>
        )}
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "0.9rem" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Add rule form ─────────────────────────────────────────────────────────────

function AddRuleForm({ onCreated }: { onCreated: (r: AlertRule) => void }) {
  const [form, setForm] = useState<AlertRuleCreate>({
    name: "",
    condition: "gt",
    notification_type: "both",
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof AlertRuleCreate, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (form.condition !== "failed" && form.attr_id == null) {
      setErr("Attribute ID is required for this condition"); return;
    }
    setSaving(true);
    setErr(null);
    try {
      const rule = await createAlertRule(form);
      onCreated(rule);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 10,
        padding: "1rem",
        marginBottom: "1rem",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "0.75rem",
      }}
    >
      <Field label="Rule name">
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Temperature warning"
          style={inputStyle}
        />
      </Field>

      <Field label="Condition">
        <select value={form.condition} onChange={(e) => set("condition", e.target.value)} style={inputStyle}>
          <option value="gt">attribute &gt; threshold</option>
          <option value="lt">attribute &lt; threshold</option>
          <option value="change">attribute increases (change)</option>
          <option value="failed">overall health = FAILED</option>
        </select>
      </Field>

      {form.condition !== "failed" && (
        <Field label="Attribute ID">
          <input
            type="number"
            value={form.attr_id ?? ""}
            onChange={(e) => set("attr_id", e.target.value ? parseInt(e.target.value) : null)}
            placeholder="e.g. 194"
            style={inputStyle}
          />
        </Field>
      )}

      {(form.condition === "gt" || form.condition === "lt") && (
        <Field label="Threshold value">
          <input
            type="number"
            value={form.threshold_value ?? ""}
            onChange={(e) =>
              set("threshold_value", e.target.value ? parseFloat(e.target.value) : null)
            }
            placeholder="e.g. 55"
            style={inputStyle}
          />
        </Field>
      )}

      <Field label="Notify via">
        <select
          value={form.notification_type}
          onChange={(e) => set("notification_type", e.target.value)}
          style={inputStyle}
        >
          <option value="log">Log only</option>
          <option value="webhook">Webhook only</option>
          <option value="both">Log + Webhook</option>
        </select>
      </Field>

      <Field label="Disk (optional)">
        <input
          type="number"
          value={form.disk_id ?? ""}
          onChange={(e) => set("disk_id", e.target.value ? parseInt(e.target.value) : null)}
          placeholder="Leave empty for all disks"
          style={inputStyle}
        />
      </Field>

      {err && (
        <div style={{ gridColumn: "1 / -1", color: "#f87171", fontSize: "0.78rem" }}>{err}</div>
      )}

      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => void submit()}
          disabled={saving}
          style={{
            background: saving ? "#334155" : "#1d4ed8",
            color: "#eff6ff",
            border: "none",
            borderRadius: 7,
            padding: "0.4rem 1rem",
            fontWeight: 600,
            fontSize: "0.82rem",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Create rule"}
        </button>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function TabBtn({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#1e293b" : "transparent",
        border: `1px solid ${active ? "#334155" : "transparent"}`,
        color: active ? "#e2e8f0" : "#64748b",
        borderRadius: 7,
        padding: "0.4rem 1rem",
        fontWeight: active ? 600 : 400,
        fontSize: "0.85rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          style={{
            background: "#ef4444",
            color: "#fff",
            borderRadius: 10,
            padding: "0 6px",
            fontSize: "0.68rem",
            fontWeight: 700,
            lineHeight: "18px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", color: "#64748b", fontSize: "0.72rem", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#e2e8f0",
  padding: "0.4rem 0.6rem",
  fontSize: "0.82rem",
  fontFamily: "inherit",
};

const ghostBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #334155",
  color: "#94a3b8",
  borderRadius: 6,
  padding: "0.25rem 0.6rem",
  fontSize: "0.78rem",
  cursor: "pointer",
};
