import { Icon, type IconName } from "./Icon";

export type Stat = { label: string; value: string; note: string; icon?: IconName };

const CYCLE: IconName[] = ["cap", "users", "check", "chart"];

/**
 * One compact row of headline figures (styles/app.css sizes every strip the
 * same; `compact` is kept for existing callers). Icons cycle as in the mocks
 * unless given, and show only where a stylesheet asks for them.
 */
export function StatStrip({ items, compact = false }: { items: Stat[]; compact?: boolean }) {
  return (
    <div className={`stat-strip ${compact ? "compact" : ""}`}>
      {items.map((s, i) => (
        <div className="stat" key={s.label + i}>
          <div className="stat-label">{s.label}</div>
          <div className="mini-icon">
            <Icon name={s.icon ?? CYCLE[i % 4]} />
          </div>
          <div className="stat-value mono">{s.value}</div>
          <div className="stat-note">{s.note}</div>
        </div>
      ))}
    </div>
  );
}

/** The same figures as a row of chips, for a screen that keeps its numbers,
    search and filters on one line (.toolbar). */
export function StatChips({ items }: { items: Stat[] }) {
  return (
    <div className="stat-chips">
      {items.map((s, i) => (
        <span className="stat-chip" key={s.label + i} title={s.note}>
          <b>{s.value}</b>
          {s.label}
        </span>
      ))}
    </div>
  );
}
