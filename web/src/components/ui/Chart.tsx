import { Fragment } from "react";

/** The mocks' weekly trend chart (bar or line), drawn at 640×225. */
export function Chart({
  kind = "bar",
  labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  values = [75, 90, 84, 94, 80, 88],
}: {
  kind?: "bar" | "line";
  labels?: string[];
  values?: number[];
}) {
  const grid = [0, 1, 2, 3].map((i) => 20 + i * 51);
  const pts = values.map((v, i) => [62 + i * 102, 180 - v * 1.4] as const);
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg className="chart-svg" viewBox="0 0 640 225" role="img" aria-label="Sample weekly trend chart">
      {grid.map((y, i) => (
        <Fragment key={y}>
          <path d={`M38 ${y}H620`} stroke="#e9eff8" strokeDasharray="3 4" />
          <text x="7" y={y + 4} fill="#91a2ba" fontSize="10" fontFamily="Manrope">
            {100 - i * 25}
          </text>
        </Fragment>
      ))}
      {kind === "line" ? (
        <>
          <polygon points={`62,183 ${line} 572,183`} fill="#eef5ff" />
          <polyline points={line} stroke="#2563eb" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />
          ))}
        </>
      ) : (
        values.map((v, i) => {
          const x = 65 + i * 92;
          const h = v * 1.55;
          return (
            <Fragment key={i}>
              <rect x={x} y={183 - h} width="31" height={h} rx="5" fill={i === 3 ? "#2563eb" : "#73a6f5"} />
              <rect x={x + 36} y={183 - h * 0.76} width="20" height={h * 0.76} rx="4" fill="#dbe9fe" />
            </Fragment>
          );
        })
      )}
      {labels.slice(0, 6).map((l, i) => (
        <text key={l + i} x={85 + i * 92} y="210" textAnchor="middle" fill="#8196b5" fontSize="10" fontFamily="Manrope">
          {l}
        </text>
      ))}
    </svg>
  );
}
