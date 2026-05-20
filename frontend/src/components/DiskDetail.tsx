import { useState } from "react";
import type { DiskDetail as DiskDetailData, TemperaturePoint } from "../api";
import {
  tempColor,
  formatCapacity,
  formatHours,
  attrRaw,
  triggerTest,
  computeHealthScore,
} from "../api";
import TempHistoryChart from "./SnapshotChart";
import AttributesTable from "./AttributesTable";
import HealthScore from "./HealthScore";
import HistoryChart from "./HistoryChart";
import SchedulePanel from "./SchedulePanel";

type DetailTab = "overview" | "history";

interface Props {
  disk: DiskDetailData;
  tempHistory: TemperaturePoint[];
  onBack: () => void;
}

export default function DiskDetail({ disk, tempHistory, onBack }: Props) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [testState, setTestState] = useState<"idle" | "running" | "done">("idle");
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const latest = tempHistory[tempHistory.length - 1]?.temperature ?? null;
  const tc = tempColor(latest);

  // ATA: POH=9, power-cycles=12; NVMe synthetic: POH=1005, cycles=1006
  const poh = attrRaw(disk.attributes, 9, 1005);
  const powerCycles = attrRaw(disk.attributes, 12, 1006);
  const { score, deductions } = computeHealthScore(
    disk.attributes,
    disk.latest_snapshot?.overall_health ?? null,
  );

  const runTest = async (type: "short" | "long") => {
    setTestState("running");
    setTestMsg(null);
    try {
      const result = await triggerTest(disk.id, type);
      setTestMsg(result.message);
    } catch {
      setTestMsg("Failed to start test — check device access.");
    } finally {
      setTestState("done");
    }
  };

  return (
    <div>
      {/* ── Breadcrumb bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
        <button
          onClick={onBack}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            color: "#94a3b8",
            borderRadius: 6,
            padding: "0.35rem 0.75rem",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          ← Back
        </button>
        <span style={{ color: "#475569" }}>/</span>
        <span style={{ fontWeight: 600 }}>{disk.name}</span>
        {disk.model && <span style={{ color: "#64748b" }}>— {disk.model}</span>}
        <HealthBadge health={disk.latest_snapshot?.overall_health ?? null} />
      </div>

      {/* ── Detail tabs ── */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.25rem" }}>
        {(["overview", "history"] as DetailTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#1e293b" : "transparent",
              border: `1px solid ${tab === t ? "#334155" : "transparent"}`,
              color: tab === t ? "#e2e8f0" : "#64748b",
              borderRadius: 7,
              padding: "0.35rem 0.9rem",
              fontWeight: tab === t ? 600 : 400,
              fontSize: "0.85rem",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <>
          {/* Info row */}
          <div
            style={{
              background: "#1e293b",
              borderRadius: 10,
              padding: "0.9rem 1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "1.5rem",
              marginBottom: "1.25rem",
              fontSize: "0.82rem",
            }}
          >
            <InfoField label="Serial" value={disk.serial} />
            <InfoField label="Firmware" value={disk.firmware} />
            <InfoField label="Interface" value={disk.interface?.toUpperCase()} />
            <InfoField label="Capacity" value={formatCapacity(disk.capacity_gb)} />
            <InfoField label="First seen" value={fmtDateLong(disk.first_seen)} />
            <InfoField label="Last scan" value={fmtDateLong(disk.last_seen)} />
            {/* Health score inline */}
            <div style={{ flex: "0 0 200px" }}>
              <HealthScore score={score} deductions={deductions} />
            </div>
          </div>

          {/* Main two-column section */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
            {/* Left: gauge + test buttons */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Temperature
              </div>
              <TempGauge temperature={latest} />

              <div style={{ width: "100%", borderTop: "1px solid #334155", paddingTop: "0.9rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  Self-test
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <TestBtn label="Short" disabled={testState === "running"} onClick={() => runTest("short")} />
                  <TestBtn label="Long" disabled={testState === "running"} onClick={() => runTest("long")} />
                </div>
                {testMsg && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#94a3b8" }}>
                    {testMsg}
                  </div>
                )}
              </div>

              <SchedulePanel diskId={disk.id} />
            </div>

            {/* Right: key stats + 30-day temp chart */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.1rem" }}>
              <div style={{ display: "flex", gap: "2rem", marginBottom: "1.25rem" }}>
                <BigStat
                  label="Power-on time"
                  value={formatHours(poh)}
                  sub={poh != null ? `${poh.toLocaleString()} hours` : undefined}
                />
                <BigStat
                  label="Power cycles"
                  value={powerCycles != null ? powerCycles.toLocaleString() : "—"}
                />
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                30-Day Temperature History
              </div>
              <TempHistoryChart data={tempHistory} />
            </div>
          </div>

          {/* SMART attributes table */}
          <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                SMART Attributes
              </div>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.72rem", color: "#64748b" }}>
                <LegendDot color="#f87171" label="Failing (value ≤ threshold)" />
                <LegendDot color="#fcd34d" label="Critical attribute non-zero" />
              </div>
            </div>
            <AttributesTable attributes={disk.attributes} />
          </div>
        </>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Attribute History — select attributes and time range to overlay
          </div>
          <HistoryChart diskId={disk.id} availableAttrs={disk.attributes} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: string | null }) {
  const color = health === "PASSED" ? "#4ade80" : health === "FAILED" ? "#f87171" : "#94a3b8";
  const bg = health === "PASSED" ? "#14532d" : health === "FAILED" ? "#450a0a" : "#1e293b";
  return (
    <span
      style={{
        background: bg,
        color,
        borderRadius: 6,
        padding: "2px 9px",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
      }}
    >
      {health ?? "UNKNOWN"}
    </span>
  );
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ color: "#475569", fontSize: "0.68rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "#e2e8f0", fontWeight: 500, marginTop: 1 }}>{value ?? "—"}</div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div style={{ color: "#64748b", fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#e2e8f0", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ color: "#475569", fontSize: "0.72rem", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TestBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: disabled ? "#1e293b" : "#0f3460",
        border: "1px solid #1d4ed8",
        color: disabled ? "#475569" : "#93c5fd",
        borderRadius: 6,
        padding: "0.3rem 0.5rem",
        fontSize: "0.75rem",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

// ── Temperature gauge ──────────────────────────────────────────────────────────

const GAUGE_MIN = 20;
const GAUGE_MAX = 75;

function TempGauge({ temperature }: { temperature: number | null }) {
  const cx = 95, cy = 90, r = 72;
  const sw = 12; // stroke width

  const tc = tempColor(temperature);

  const f =
    temperature == null
      ? 0
      : Math.min(0.9999, Math.max(0, (temperature - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)));

  // Angle goes from π (left) to 0 (right), arc traces through the top.
  const theta = Math.PI * (1 - f);
  const ex = cx + r * Math.cos(theta);
  const ey = cy - r * Math.sin(theta);

  const largeArc = f > 0.5 ? 1 : 0;

  const bgPath = `M ${cx - r},${cy} A ${r},${r} 0 0,0 ${cx + r},${cy}`;
  const fgPath =
    f <= 0
      ? null
      : `M ${cx - r},${cy} A ${r},${r} 0 ${largeArc},0 ${ex.toFixed(2)},${ey.toFixed(2)}`;

  return (
    <svg width={cx * 2} height={cy + 18} viewBox={`0 0 ${cx * 2} ${cy + 18}`}>
      {/* Color zone arcs (background decoration) */}
      <ZoneArc cx={cx} cy={cy} r={r} sw={sw} min={GAUGE_MIN} max={GAUGE_MAX} from={GAUGE_MIN} to={44} color="#14532d" />
      <ZoneArc cx={cx} cy={cy} r={r} sw={sw} min={GAUGE_MIN} max={GAUGE_MAX} from={45} to={54} color="#78350f" />
      <ZoneArc cx={cx} cy={cy} r={r} sw={sw} min={GAUGE_MIN} max={GAUGE_MAX} from={55} to={GAUGE_MAX} color="#450a0a" />

      {/* Track */}
      <path d={bgPath} fill="none" stroke="#0f172a" strokeWidth={sw + 2} />
      <path d={bgPath} fill="none" stroke="#1e293b" strokeWidth={sw} />

      {/* Filled arc */}
      {fgPath && (
        <path
          d={fgPath}
          fill="none"
          stroke={tc}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}

      {/* Temperature value */}
      <text
        x={cx}
        y={cy - 16}
        textAnchor="middle"
        fill={tc}
        fontSize="26"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        {temperature != null ? `${temperature}°` : "—"}
      </text>
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fill="#475569"
        fontSize="11"
        fontFamily="system-ui, sans-serif"
      >
        Celsius
      </text>

      {/* Range labels */}
      <text x={cx - r - 4} y={cy + 14} textAnchor="end" fill="#334155" fontSize="9">
        {GAUGE_MIN}°
      </text>
      <text x={cx + r + 4} y={cy + 14} textAnchor="start" fill="#334155" fontSize="9">
        {GAUGE_MAX}°
      </text>
    </svg>
  );
}

function ZoneArc({
  cx, cy, r, sw, min, max, from, to, color,
}: {
  cx: number; cy: number; r: number; sw: number;
  min: number; max: number; from: number; to: number; color: string;
}) {
  const range = max - min;
  const f1 = Math.min(0.9999, Math.max(0, (from - min) / range));
  const f2 = Math.min(0.9999, Math.max(0, (to - min) / range));
  const t1 = Math.PI * (1 - f1);
  const t2 = Math.PI * (1 - f2);
  const x1 = cx + r * Math.cos(t1);
  const y1 = cy - r * Math.sin(t1);
  const x2 = cx + r * Math.cos(t2);
  const y2 = cy - r * Math.sin(t2);
  const large = f2 - f1 > 0.5 ? 1 : 0;
  const d = `M ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 ${large},0 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  return <path d={d} fill="none" stroke={color} strokeWidth={sw + 8} opacity={0.35} />;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
