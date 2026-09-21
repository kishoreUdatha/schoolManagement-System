// Display helpers shared by wired screens. Indian formats, as in the mocks.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-21" or an ISO timestamp -> "21 Sep 2026". Empty -> "—". */
export function date(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return v;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** ISO timestamp -> "21 Sep, 09:40 AM" in the viewer's time zone. */
export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return v;
  const time = t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  return `${String(t.getDate()).padStart(2, "0")} ${MONTHS[t.getMonth()]}, ${time}`;
}

/** 12500 -> "₹12,500"; null -> "—". */
export function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** 81.25 -> "81.3%"; null -> "—". */
export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}%`;
}

/** "school_admin" -> "School admin". */
export function label(v: string | null | undefined): string {
  if (!v) return "—";
  const s = v.replace(/_/g, " ");
  return s[0].toUpperCase() + s.slice(1);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
