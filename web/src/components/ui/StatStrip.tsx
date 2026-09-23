import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export type Stat = { label: string; value: string; note: string; icon?: IconName };

/** A headline figure that leads somewhere: the same numbers, as cards. */
export type StatCard = Stat & { href?: string; onClick?: () => void; tone?: "blue" | "lilac" | "mint" | "peach"; active?: boolean };

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

/**
 * The same figures as cards, each with its icon and, where the number is worth
 * chasing, a link to the list behind it.
 */
export function StatCards({ items }: { items: StatCard[] }) {
  const TONES = ["blue", "lilac", "mint", "peach"] as const;
  return (
    <div className="stat-cards">
      {items.map((s, i) => {
        const inside = (
          <>
            <span className={`stat-card-icon ${s.tone ?? TONES[i % 4]}`}>
              <Icon name={s.icon ?? CYCLE[i % 4]} />
            </span>
            <span className="stat-card-body">
              <span className="stat-card-label">{s.label}</span>
              <b className="mono">{s.value}</b>
              <small>{s.note}</small>
            </span>
            {s.href || s.onClick ? <Icon name="chevron" className="sm stat-card-go" /> : null}
          </>
        );
        const cls = `stat-card ${s.active ? "on" : ""}`;
        if (s.href)
          return (
            <Link className={cls} href={s.href} key={s.label + i}>
              {inside}
            </Link>
          );
        if (s.onClick)
          return (
            <button type="button" className={cls} onClick={s.onClick} key={s.label + i}>
              {inside}
            </button>
          );
        return (
          <div className={cls} key={s.label + i}>
            {inside}
          </div>
        );
      })}
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
