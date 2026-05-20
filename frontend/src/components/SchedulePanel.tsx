import { useEffect, useState } from "react";
import type { TestSchedule } from "../api";
import { deleteSchedule, fetchSchedules, upsertSchedule } from "../api";

interface Props {
  diskId: number;
}

type TestType = "short" | "long";

const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 24];

function scheduleLabel(s: TestSchedule | null): string {
  if (!s || !s.enabled) return "Off";
  return `Every ${s.interval_hours}h`;
}

function nextRunLabel(s: TestSchedule | null): string | null {
  if (!s || !s.enabled) return null;
  if (!s.last_run_at) return "On next check";
  const next = new Date(s.last_run_at).getTime() + s.interval_hours * 3600_000;
  const diff = next - Date.now();
  if (diff <= 0) return "Due now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export default function SchedulePanel({ diskId }: Props) {
  const [schedules, setSchedules] = useState<Map<TestType, TestSchedule>>(new Map());
  const [saving, setSaving] = useState<TestType | null>(null);
  const [pending, setPending] = useState<Map<TestType, { hours: number; enabled: boolean }>>(
    new Map(),
  );

  useEffect(() => {
    fetchSchedules(diskId)
      .then((list) => {
        const map = new Map<TestType, TestSchedule>();
        list.forEach((s) => map.set(s.test_type as TestType, s));
        setSchedules(map);
        // Initialise pending state from saved values
        const p = new Map<TestType, { hours: number; enabled: boolean }>();
        (["short", "long"] as TestType[]).forEach((t) => {
          const s = map.get(t);
          p.set(t, { hours: s?.interval_hours ?? 4, enabled: s?.enabled ?? false });
        });
        setPending(p);
      })
      .catch(() => {});
  }, [diskId]);

  const save = async (type: TestType) => {
    const p = pending.get(type);
    if (!p) return;
    setSaving(type);
    try {
      if (!p.enabled) {
        await deleteSchedule(diskId, type);
        setSchedules((prev) => {
          const m = new Map(prev);
          m.delete(type);
          return m;
        });
      } else {
        const updated = await upsertSchedule(diskId, type, p.hours, true);
        setSchedules((prev) => new Map(prev).set(type, updated));
      }
    } catch {
      // ignore — user can retry
    } finally {
      setSaving(null);
    }
  };

  const isDirty = (type: TestType) => {
    const saved = schedules.get(type);
    const p = pending.get(type);
    if (!p) return false;
    if (!saved) return p.enabled;
    return saved.enabled !== p.enabled || saved.interval_hours !== p.hours;
  };

  return (
    <div style={{ marginTop: "0.9rem", borderTop: "1px solid #334155", paddingTop: "0.9rem" }}>
      <div style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.6rem" }}>
        Self-test Schedule
      </div>

      {(["short", "long"] as TestType[]).map((type) => {
        const saved = schedules.get(type);
        const p = pending.get(type) ?? { hours: 4, enabled: false };
        const dirty = isDirty(type);
        const isSaving = saving === type;

        return (
          <div key={type} style={{ marginBottom: "0.6rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", textTransform: "capitalize", minWidth: 36 }}>
                {type}
              </span>

              {/* Enable toggle */}
              <button
                onClick={() =>
                  setPending((prev) => new Map(prev).set(type, { ...p, enabled: !p.enabled }))
                }
                style={{
                  width: 32, height: 18, borderRadius: 9, border: "none",
                  background: p.enabled ? "#22c55e" : "#475569",
                  cursor: "pointer", position: "relative", flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: 1,
                  left: p.enabled ? 15 : 1,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left 0.15s",
                }} />
              </button>

              {/* Interval picker */}
              <select
                value={p.hours}
                disabled={!p.enabled}
                onChange={(e) =>
                  setPending((prev) => new Map(prev).set(type, { ...p, hours: Number(e.target.value) }))
                }
                style={{
                  background: "#0f172a", border: "1px solid #334155", borderRadius: 6,
                  color: p.enabled ? "#e2e8f0" : "#475569", padding: "0.2rem 0.4rem",
                  fontSize: "0.75rem", cursor: p.enabled ? "pointer" : "not-allowed",
                }}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>Every {h}h</option>
                ))}
              </select>

              {/* Save button (only visible when dirty) */}
              {dirty && (
                <button
                  onClick={() => void save(type)}
                  disabled={isSaving}
                  style={{
                    background: "#1d4ed8", color: "#eff6ff", border: "none",
                    borderRadius: 5, padding: "0.2rem 0.6rem", fontSize: "0.72rem",
                    cursor: isSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {isSaving ? "…" : "Save"}
                </button>
              )}

              {/* Next run */}
              {saved?.enabled && !dirty && (
                <span style={{ fontSize: "0.72rem", color: "#475569" }}>
                  next: {nextRunLabel(saved)}
                </span>
              )}
            </div>

            {/* Current saved status (when not dirty) */}
            {!dirty && (
              <div style={{ fontSize: "0.68rem", color: "#334155", marginTop: 2, paddingLeft: 86 }}>
                {scheduleLabel(saved ?? null)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
