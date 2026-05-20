import type { CSSProperties, ReactNode } from "react";
import type { SmartAttribute } from "../api";

interface Props {
  attributes: SmartAttribute[];
}

// Attributes where any non-zero raw value indicates a potential problem.
const CRITICAL_IDS = new Set([5, 187, 188, 197, 198]);

type RowState = "critical" | "warn" | "ok";

function rowState(attr: SmartAttribute): RowState {
  // Failing: normalized value has crossed the threshold
  if (
    attr.value != null &&
    attr.threshold != null &&
    attr.threshold > 0 &&
    attr.value <= attr.threshold
  ) {
    return "critical";
  }
  // Warning: known-bad attribute with non-zero raw count
  if (CRITICAL_IDS.has(attr.attr_id) && attr.raw_value != null && attr.raw_value > 0) {
    return "warn";
  }
  return "ok";
}

const ROW_STYLES: Record<RowState, CSSProperties> = {
  critical: { background: "rgba(239,68,68,0.10)", color: "#fca5a5" },
  warn:     { background: "rgba(245,158,11,0.08)", color: "#fcd34d" },
  ok:       {},
};

const BADGE: Record<RowState, CSSProperties | null> = {
  critical: { background: "#7f1d1d", color: "#fca5a5", padding: "1px 7px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 700 },
  warn:     { background: "#78350f", color: "#fcd34d", padding: "1px 7px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 700 },
  ok:       null,
};

export default function AttributesTable({ attributes }: Props) {
  if (attributes.length === 0) {
    return <p style={{ color: "#64748b", marginTop: "0.5rem" }}>No attributes.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.8rem",
        }}
      >
        <thead>
          <tr style={{ color: "#64748b", textAlign: "left", borderBottom: "1px solid #334155" }}>
            <Th w={44}>ID</Th>
            <Th>Name</Th>
            <Th w={56} align="right">Value</Th>
            <Th w={56} align="right">Worst</Th>
            <Th w={56} align="right">Thresh</Th>
            <Th w={88} align="right">Raw</Th>
            <Th w={72}>Flags</Th>
            <Th w={64}></Th>
          </tr>
        </thead>
        <tbody>
          {attributes.map((attr) => {
            const state = rowState(attr);
            const rs = ROW_STYLES[state];
            const badge = BADGE[state];

            return (
              <tr
                key={attr.id}
                style={{
                  borderBottom: "1px solid #1e293b",
                  ...rs,
                }}
              >
                <td style={{ padding: "5px 6px", color: "#64748b", fontFamily: "monospace" }}>
                  {attr.attr_id}
                </td>
                <td style={{ padding: "5px 6px", fontWeight: state !== "ok" ? 600 : 400 }}>
                  {attr.attr_name ?? "—"}
                </td>
                <Num val={attr.value} align="right" />
                <Num val={attr.worst} align="right" />
                <Num val={attr.threshold} align="right" />
                <Num val={attr.raw_value} align="right" bold />
                <td style={{ padding: "5px 6px", fontFamily: "monospace", color: "#64748b", fontSize: "0.72rem" }}>
                  {attr.flags ?? "—"}
                </td>
                <td style={{ padding: "5px 6px" }}>
                  {badge && (
                    <span style={badge}>
                      {state === "critical" ? "FAILING" : "WARN"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  w,
  align,
}: {
  children?: ReactNode;
  w?: number;
  align?: "right" | "left";
}) {
  return (
    <th
      style={{
        padding: "6px",
        fontWeight: 500,
        width: w,
        textAlign: align ?? "left",
      }}
    >
      {children}
    </th>
  );
}

function Num({
  val,
  align,
  bold,
}: {
  val: number | null;
  align?: "right" | "left";
  bold?: boolean;
}) {
  return (
    <td
      style={{
        padding: "5px 6px",
        fontFamily: "monospace",
        textAlign: align ?? "left",
        fontWeight: bold ? 600 : 400,
      }}
    >
      {val != null ? val.toLocaleString() : "—"}
    </td>
  );
}
