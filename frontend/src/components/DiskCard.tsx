import type { DiskListItem, DiskDetail, TemperaturePoint } from "../api";
import {
  tempColor,
  formatCapacity,
  formatHours,
  attrRaw,
  computeHealthScore,
} from "../api";
import TempSparkline from "./TempSparkline";
import HealthScore from "./HealthScore";

interface Props {
  disk: DiskListItem;
  detail: DiskDetail | null;
  sparkData: TemperaturePoint[];
  onClick: () => void;
  onDelete?: () => void;
}

function healthStyle(health: string | null): { bg: string; fg: string } {
  if (health === "PASSED") return { bg: "#14532d", fg: "#4ade80" };
  if (health === "FAILED") return { bg: "#450a0a", fg: "#f87171" };
  return { bg: "#1e293b", fg: "#94a3b8" };
}

export default function DiskCard({ disk, detail, sparkData, onClick, onDelete }: Props) {
  const health = disk.overall_health;
  const hs = healthStyle(health);

  const currentTemp =
    sparkData.length > 0 ? sparkData[sparkData.length - 1].temperature : null;
  const tc = tempColor(currentTemp);

  // ATA attr 9 = Power_On_Hours; NVMe synthetic 1005
  const poh = detail ? attrRaw(detail.attributes, 9, 1005) : null;

  const lastScan = disk.last_snapshot_at
    ? relativeTime(disk.last_snapshot_at)
    : "never";

  return (
    <div
      onClick={onClick}
      style={{
        background: "#1e293b",
        border: `1.5px solid ${health === "FAILED" ? "#ef4444" : health === "PASSED" ? "#1e3a5f" : "#334155"}`,
        borderRadius: 12,
        padding: "1.1rem 1.25rem 0.9rem",
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
        el.style.borderColor = health === "FAILED" ? "#f87171" : "#38bdf8";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "";
        el.style.boxShadow = "";
        el.style.borderColor =
          health === "FAILED" ? "#ef4444" : health === "PASSED" ? "#1e3a5f" : "#334155";
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.01em" }}>
            {disk.name}
          </div>
          <div
            style={{
              color: "#94a3b8",
              fontSize: "0.78rem",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {disk.model ?? "Unknown model"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
          <span
            style={{
              background: hs.bg,
              color: hs.fg,
              borderRadius: 6,
              padding: "2px 9px",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
            }}
          >
            {health ?? "UNKNOWN"}
          </span>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Remove "${disk.name}" from DiskWatch? This deletes all stored history.`)) {
                  onDelete();
                }
              }}
              title="Remove disk"
              style={{
                background: "transparent",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                fontSize: "0.85rem",
                padding: "2px 4px",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.6rem 0",
          marginTop: "0.9rem",
          fontSize: "0.8rem",
        }}
      >
        <Stat label="Capacity" value={formatCapacity(disk.capacity_gb)} />
        <Stat label="Interface" value={disk.interface?.toUpperCase() ?? "—"} />
        <Stat
          label="Temp"
          value={currentTemp != null ? `${currentTemp}°C` : "—"}
          valueColor={tc}
        />
        <Stat label="Power-on" value={formatHours(poh)} />
        <Stat label="Last scan" value={lastScan} colSpan={2} />
      </div>

      {/* Sparkline */}
      <div style={{ marginTop: "0.6rem" }}>
        <div style={{ color: "#475569", fontSize: "0.68rem", marginBottom: 2 }}>
          Temp · 7 days
        </div>
        <TempSparkline data={sparkData} height={34} />
      </div>

      {/* Health score */}
      {detail && (() => {
        const { score, deductions } = computeHealthScore(
          detail.attributes,
          disk.overall_health,
        );
        return (
          <div style={{ marginTop: "0.6rem" }}>
            <HealthScore score={score} deductions={deductions} compact />
          </div>
        );
      })()}
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
  colSpan,
}: {
  label: string;
  value: string;
  valueColor?: string;
  colSpan?: number;
}) {
  return (
    <div style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <div style={{ color: "#475569", fontSize: "0.68rem" }}>{label}</div>
      <div style={{ fontWeight: 600, color: valueColor ?? "#e2e8f0" }}>{value}</div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}
