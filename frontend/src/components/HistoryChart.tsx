import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { SmartAttribute, AttributeHistory } from "../api";
import { fetchAttributeHistory } from "../api";

// ── Config ────────────────────────────────────────────────────────────────────

// Pre-selected + named attribute catalogue for the picker.
const KNOWN_ATTRS: { id: number; label: string }[] = [
  { id: 194, label: "194 Temperature_Celsius" },
  { id: 190, label: "190 Airflow_Temperature" },
  { id: 5,   label: "5 Reallocated_Sectors" },
  { id: 197, label: "197 Pending_Sectors" },
  { id: 198, label: "198 Offline_Uncorrectable" },
  { id: 187, label: "187 Reported_Uncorrect" },
  { id: 188, label: "188 Command_Timeout" },
  { id: 9,   label: "9 Power_On_Hours" },
  { id: 12,  label: "12 Power_Cycle_Count" },
];

const DEFAULT_SELECTION = new Set([194, 190, 5, 197, 198]);

const PALETTE = [
  "#38bdf8", // sky
  "#f97316", // orange
  "#eab308", // yellow
  "#ef4444", // red
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fb7185", // rose
  "#60a5fa", // blue
  "#fbbf24", // amber
];

function attrColor(attrId: number, idx: number): string {
  const fixed: Record<number, string> = {
    194: "#38bdf8",
    190: "#7dd3fc",
    5:   "#f97316",
    197: "#eab308",
    198: "#ef4444",
    187: "#a78bfa",
    188: "#fb7185",
    9:   "#34d399",
    12:  "#60a5fa",
  };
  return fixed[attrId] ?? PALETTE[idx % PALETTE.length];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  diskId: number;
  availableAttrs: SmartAttribute[];  // from latest snapshot — tells us which attrs exist
}

// ── Component ─────────────────────────────────────────────────────────────────

type Days = 7 | 30 | 90;

export default function HistoryChart({ diskId, availableAttrs }: Props) {
  const existingIds = new Set(availableAttrs.map((a) => a.attr_id));

  // Build the picker list: known attrs that exist on this disk + any extras.
  const pickerAttrs = [
    ...KNOWN_ATTRS.filter((k) => existingIds.has(k.id)),
    ...availableAttrs
      .filter((a) => !KNOWN_ATTRS.some((k) => k.id === a.attr_id))
      .map((a) => ({ id: a.attr_id, label: `${a.attr_id} ${a.attr_name ?? ""}` })),
  ];

  const initialSelection = pickerAttrs
    .filter((a) => DEFAULT_SELECTION.has(a.id))
    .map((a) => a.id);

  const [selected, setSelected] = useState<number[]>(initialSelection);
  const [days, setDays] = useState<Days>(30);
  const [histories, setHistories] = useState<Map<number, AttributeHistory>>(new Map());
  const [loading, setLoading] = useState(false);

  const loadHistories = useCallback(async () => {
    if (selected.length === 0) {
      setHistories(new Map());
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        selected.map((id) => fetchAttributeHistory(diskId, id, days).catch(() => null)),
      );
      const map = new Map<number, AttributeHistory>();
      selected.forEach((id, i) => {
        const r = results[i];
        if (r) map.set(id, r);
      });
      setHistories(map);
    } finally {
      setLoading(false);
    }
  }, [diskId, selected, days]);

  useEffect(() => {
    void loadHistories();
  }, [loadHistories]);

  // Merge histories into a flat array keyed by truncated timestamp.
  const chartData = buildChartData(histories, selected);

  const toggleAttr = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div>
      {/* ── Controls ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-start",
          marginBottom: "1rem",
        }}
      >
        {/* Attribute checkboxes */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", flex: 1 }}>
          {pickerAttrs.map((attr, idx) => {
            const active = selected.includes(attr.id);
            const color = attrColor(attr.id, idx);
            return (
              <button
                key={attr.id}
                onClick={() => toggleAttr(attr.id)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  border: `1.5px solid ${active ? color : "#334155"}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : "#64748b",
                  fontSize: "0.75rem",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {attr.label}
              </button>
            );
          })}
        </div>

        {/* Day range buttons */}
        <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
          {([7, 30, 90] as Days[]).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: "3px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: days === d ? "#1d4ed8" : "transparent",
                color: days === d ? "#eff6ff" : "#64748b",
                fontSize: "0.78rem",
                fontWeight: days === d ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      {loading && (
        <div style={{ color: "#475569", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          Loading…
        </div>
      )}

      {chartData.length === 0 && !loading && (
        <div style={{ color: "#475569", fontSize: "0.85rem" }}>
          No data for the selected attributes and time range.
        </div>
      )}

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#475569"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#475569"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                fontSize: "0.78rem",
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Legend
              wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }}
            />
            {selected.map((attrId, idx) => {
              const h = histories.get(attrId);
              const name = h?.attr_name ?? `attr_${attrId}`;
              return (
                <Line
                  key={attrId}
                  type="monotone"
                  dataKey={`a${attrId}`}
                  name={name}
                  stroke={attrColor(attrId, idx)}
                  dot={false}
                  strokeWidth={1.8}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Data merge ────────────────────────────────────────────────────────────────

type ChartRow = Record<string, string | number | null>;

function buildChartData(
  histories: Map<number, AttributeHistory>,
  attrIds: number[],
): ChartRow[] {
  // Align by "YYYY-MM-DDTHH:MM" (truncate seconds).
  const byTime = new Map<string, ChartRow>();

  for (const attrId of attrIds) {
    const h = histories.get(attrId);
    if (!h) continue;
    for (const pt of h.data) {
      const key = pt.timestamp.slice(0, 16);
      if (!byTime.has(key)) {
        byTime.set(key, {
          date: fmtDate(pt.timestamp),
          _ts: key,
        });
      }
      byTime.get(key)![`a${attrId}`] = pt.raw_value;
    }
  }

  return Array.from(byTime.values()).sort((a, b) =>
    (a._ts as string).localeCompare(b._ts as string),
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
}
