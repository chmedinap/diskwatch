import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TemperaturePoint } from "../api";
import { tempColor } from "../api";

interface Props {
  data: TemperaturePoint[];
}

export default function TempHistoryChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div style={{ color: "#475569", fontSize: "0.85rem", padding: "1rem 0" }}>
        No temperature history yet.
      </div>
    );
  }

  const chartData = data.map((p) => ({
    date: fmtDate(p.timestamp),
    temp: p.temperature,
  }));

  const latest = data[data.length - 1]?.temperature ?? null;
  const lineColor = tempColor(latest);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
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
          tickFormatter={(v) => `${v}°`}
          domain={["auto", "auto"]}
          width={30}
        />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 6,
            fontSize: "0.8rem",
          }}
          formatter={(v: number) => [`${v}°C`, "Temperature"]}
          labelStyle={{ color: "#94a3b8" }}
        />
        {/* Amber threshold line */}
        <ReferenceLine y={45} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.5} />
        {/* Red threshold line */}
        <ReferenceLine y={55} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5} />
        <Line
          type="monotone"
          dataKey="temp"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
