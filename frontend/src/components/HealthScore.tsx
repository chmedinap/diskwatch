import { useState } from "react";
import type { HealthScoreResult } from "../api";

interface Props extends HealthScoreResult {
  compact?: boolean;
}

function scoreColor(s: number): string {
  if (s >= 70) return "#22c55e";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(s: number): string {
  if (s >= 80) return "Excellent";
  if (s >= 70) return "Good";
  if (s >= 50) return "Fair";
  if (s >= 30) return "Poor";
  return "Critical";
}

export default function HealthScore({ score, deductions, compact = false }: Props) {
  const [showTip, setShowTip] = useState(false);
  const color = scoreColor(score);
  const pct = `${score}%`;

  if (compact) {
    return (
      <div
        style={{ position: "relative", cursor: deductions.length > 0 ? "pointer" : "default" }}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div
            style={{
              flex: 1,
              height: 5,
              background: "#0f172a",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: pct,
                height: "100%",
                background: color,
                borderRadius: 3,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>
            {score}
          </span>
        </div>
        {showTip && deductions.length > 0 && (
          <Tooltip deductions={deductions} score={score} color={color} />
        )}
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative", cursor: deductions.length > 0 ? "pointer" : "default" }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem" }}>
        <span style={{ fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Health Score
        </span>
        <span style={{ fontWeight: 700, color, fontSize: "1rem" }}>
          {score} <span style={{ fontSize: "0.72rem", fontWeight: 400 }}>— {scoreLabel(score)}</span>
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "#0f172a",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: pct,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.4s ease",
            boxShadow: `0 0 6px ${color}66`,
          }}
        />
      </div>
      {showTip && deductions.length > 0 && (
        <Tooltip deductions={deductions} score={score} color={color} />
      )}
    </div>
  );
}

function Tooltip({
  deductions,
  score,
  color,
}: {
  deductions: string[];
  score: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "110%",
        left: 0,
        zIndex: 50,
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "0.65rem 0.9rem",
        minWidth: 220,
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, color, marginBottom: "0.4rem", fontSize: "0.85rem" }}>
        Score: {score}/100
      </div>
      {deductions.map((d, i) => (
        <div key={i} style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 2 }}>
          • {d}
        </div>
      ))}
    </div>
  );
}
