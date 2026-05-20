import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { TemperaturePoint } from "../api";
import { tempColor } from "../api";

interface Props {
  data: TemperaturePoint[];
  height?: number;
}

export default function TempSparkline({ data, height = 36 }: Props) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          color: "#475569",
          fontSize: "0.72rem",
        }}
      >
        no data
      </div>
    );
  }

  const latest = data[data.length - 1]?.temperature ?? null;
  const color = tempColor(latest);
  const chartData = data.map((p) => ({ t: p.temperature }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="t"
          stroke={color}
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
