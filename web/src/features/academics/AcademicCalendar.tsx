"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Dialog, time12 } from "./planKit";
import type { CalendarItem } from "./planTypes";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TYPES: Record<string, [string, string]> = {
  event: ["Event", ""],
  holiday: ["Holiday", "mint"],
  exam: ["Exam", "peach"],
  ptm: ["PT meeting", "mint"],
  ptm_slot: ["My meeting", "peach"],
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** SCR-108, live: GET /api/v1/school/calendar (start, end): events, holidays, exams and PTMs in one feed. */
export function AcademicCalendar() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [type, setType] = useState("");
  const [state, setState] = useState("");
  const [open, setOpen] = useState<CalendarItem | null>(null);

  const first = new Date(ym.y, ym.m, 1);
  const last = new Date(ym.y, ym.m + 1, 0);
  const feed = useApi<CalendarItem[]>("/api/v1/school/calendar", { start: iso(first), end: iso(last) });

  const items = useMemo(
    () =>
      (feed.data ?? []).filter(
        (it) => (!type || it.type === type) && (!state || (state === "draft" ? it.is_draft : state === "cancelled" ? it.is_cancelled : !it.is_draft && !it.is_cancelled)),
      ),
    [feed.data, type, state],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const d = new Date(`${it.start_date}T00:00:00`);
      const end = new Date(`${it.end_date}T00:00:00`);
      for (; d <= end; d.setDate(d.getDate() + 1)) map.set(iso(d), [...(map.get(iso(d)) ?? []), it]);
    }
    return map;
  }, [items]);

  // Leading and trailing days from the neighbouring months, as the mock shows them.
  const cells: { key: string; day: number; outside: boolean }[] = [];
  const lead = (first.getDay() + 6) % 7;
  for (let i = lead; i > 0; i--) {
    const d = new Date(ym.y, ym.m, 1 - i);
    cells.push({ key: iso(d), day: d.getDate(), outside: true });
  }
  for (let d = 1; d <= last.getDate(); d++) cells.push({ key: iso(new Date(ym.y, ym.m, d)), day: d, outside: false });
  for (let d = 1; cells.length % 7; d++) cells.push({ key: iso(new Date(ym.y, ym.m + 1, d)), day: d, outside: true });

  const today = iso(now);
  const shift = (n: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All entries</option>
          {Object.entries(TYPES).map(([k, [l]]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" className="btn" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <label className="btn" style={{ gap: 8 }}>
          <Icon name="calendar" className="sm" />
          <input
            type="month"
            aria-label="Month"
            value={`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (y && m) setYm({ y, m: m - 1 });
            }}
            style={{ border: 0, background: "transparent", font: "inherit" }}
          />
        </label>
        <button type="button" className="btn" aria-label="Next month" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <ErrorNote>{feed.error}</ErrorNote>
      <Panel
        title={`${MONTHS[ym.m]} ${ym.y}`}
        sub={`${items.length} entr${items.length === 1 ? "y" : "ies"}${feed.loading ? " · Loading…" : ""} · Drafts show only to staff`}
        action={
          <button type="button" className="btn" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>
            Today
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <div className="calendar-grid">
            {DAYS.map((d) => (
              <div className="day-head" key={d}>
                {d}
              </div>
            ))}
            {cells.map((c) => (
              <div key={c.key} className={`calendar-day ${c.outside ? "outside" : ""} ${c.key === today ? "today" : ""}`}>
                <strong>{c.day}</strong>
                {c.outside
                  ? null
                  : (byDate.get(c.key) ?? []).slice(0, 3).map((it) => (
                      <button type="button" key={`${it.type}-${it.id}`} className={`cal-event ${TYPES[it.type]?.[1] ?? ""}`} onClick={() => setOpen(it)} style={it.is_cancelled ? { textDecoration: "line-through" } : undefined}>
                        {it.title}
                        {it.start_time ? (
                          <>
                            <br />
                            {time12(it.start_time)}
                          </>
                        ) : null}
                      </button>
                    ))}
                {!c.outside && (byDate.get(c.key)?.length ?? 0) > 3 ? <small className="muted">{`+${(byDate.get(c.key)?.length ?? 0) - 3} more`}</small> : null}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Dialog title={open?.title ?? ""} open={open !== null} onClose={() => setOpen(null)}>
        {open ? (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 12 }}>
              <Badge>{TYPES[open.type]?.[0] ?? open.type}</Badge>
              {open.is_draft ? <Badge>Draft</Badge> : null}
              {open.is_cancelled ? <Badge>Cancelled</Badge> : null}
            </div>
            <dl className="kv">
              <div>
                <dt>When</dt>
                <dd>{`${date(open.start_date)}${open.end_date !== open.start_date ? ` – ${date(open.end_date)}` : ""}${open.start_time ? ` · ${time12(open.start_time)}${open.end_time ? ` – ${time12(open.end_time)}` : ""}` : ""}`}</dd>
              </div>
            </dl>
            {open.detail ? <p style={{ marginTop: 12 }}>{open.detail}</p> : null}
            <div className="actions row">
              <button type="button" className="btn primary" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
