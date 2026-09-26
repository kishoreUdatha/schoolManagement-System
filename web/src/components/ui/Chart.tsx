import { Fragment } from "react";

const SAMPLE = [75, 90, 84, 94, 80, 88];

const LEFT = 70;
const RIGHT = 600;
const BASE = 183; // the 0 line
const TOP = 23; // the 100 line
const yAt = (v: number) => BASE - (Math.min(100, Math.max(0, v)) / 100) * (BASE - TOP);

/**
 * The mocks' weekly trend chart (bar or line), drawn at 640×225 on a 0–100
 * scale: the gridlines, the points and the labels under them share one scale.
 * A null value is a gap (nothing recorded), never a zero. `scale="relative"`
 * is for figures shown as a share of the largest (money, counts): the
 * gridlines stay, the 0–100 figures beside them go. `compare` draws a lighter
 * second bar beside each bar; the mock's sample chart shows one at 76%, live
 * data shows one only when given.
 */
export function Chart({
  kind = "bar",
  labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  values = SAMPLE,
  compare,
  label,
  showValues = false,
  scale = "percent",
}: {
  kind?: "bar" | "line";
  labels?: string[];
  values?: (number | null)[];
  compare?: (number | null)[];
  label?: string;
  /** Print each bar's figure above it, as the mocks' attendance trend does. */
  showValues?: boolean;
  scale?: "percent" | "relative";
}) {
  const sample = values === SAMPLE && !compare;
  const n = Math.max(values.length, 1);
  // line points run edge to edge; bars sit in the middle of equal slots
  const xAt = (i: number) =>
    kind === "line" ? (n === 1 ? (LEFT + RIGHT) / 2 : LEFT + (i * (RIGHT - LEFT)) / (n - 1)) : LEFT + ((i + 0.5) * (RIGHT - LEFT)) / n;
  const slot = (RIGHT - LEFT) / n;
  const barW = Math.min(31, slot * 0.4);

  // consecutive recorded points form one stretch of line
  const runs: [number, number][][] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) return runs.push([]);
    if (!runs.length) runs.push([]);
    runs[runs.length - 1].push([xAt(i), yAt(v)]);
  });

  return (
    <svg className="chart-svg" viewBox="0 0 640 225" role="img" aria-label={label ?? (values === SAMPLE ? "Sample weekly trend chart" : "Trend chart")}>
      {[100, 75, 50, 25, 0].map((g) => (
        <Fragment key={g}>
          <path d={`M${LEFT - 30} ${yAt(g)}H620`} stroke={g ? "#e9eff8" : "#dbe4f1"} strokeDasharray={g ? "3 4" : undefined} />
          {scale === "percent" ? (
            <text x="7" y={yAt(g) + 4} fill="#6b7d99" fontSize="10" fontFamily="Manrope">
              {g}
            </text>
          ) : null}
        </Fragment>
      ))}
      {kind === "line" ? (
        runs
          .filter((r) => r.length)
          .map((r) => {
            const line = r.map(([x, y]) => `${x},${y}`).join(" ");
            return (
              <Fragment key={r[0][0]}>
                {r.length > 1 ? <polygon points={`${r[0][0]},${BASE} ${line} ${r[r.length - 1][0]},${BASE}`} fill="#eef5ff" /> : null}
                {r.length > 1 ? <polyline points={line} stroke="#2563eb" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
                {r.map(([x, y]) => (
                  <circle key={x} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />
                ))}
              </Fragment>
            );
          })
      ) : (
        values.map((v, i) => {
          if (v === null || v === undefined) return null;
          const x = xAt(i) - (sample || compare ? barW * 0.8 : barW / 2);
          const h = BASE - yAt(v);
          const c = compare?.[i];
          return (
            <Fragment key={i}>
              <rect x={x} y={BASE - h} width={barW} height={h} rx="5" fill={i === 3 && sample ? "#2563eb" : "#73a6f5"} />
              {showValues ? (
                <text x={x + barW / 2} y={BASE - h - 7} textAnchor="middle" fill="#3c5170" fontSize="11" fontWeight="700" fontFamily="Manrope">
                  {`${v}%`}
                </text>
              ) : null}
              {sample ? <rect x={x + barW + 5} y={BASE - h * 0.76} width={barW * 0.65} height={h * 0.76} rx="4" fill="#dbe9fe" /> : null}
              {c !== null && c !== undefined ? <rect x={x + barW + 5} y={yAt(c)} width={barW * 0.65} height={BASE - yAt(c)} rx="4" fill="#dbe9fe" /> : null}
            </Fragment>
          );
        })
      )}
      {labels.slice(0, n).map((l, i) => (
        <text key={l + i} x={xAt(i)} y="210" textAnchor="middle" fill="#6b7d99" fontSize="10" fontFamily="Manrope">
          {l}
        </text>
      ))}
    </svg>
  );
}
