"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { type CalendarItem, hhmm, isoDay, useRole } from "./shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TONE: Record<CalendarItem["type"], string> = { event: "", holiday: "mint", exam: "peach", ptm: "peach", ptm_slot: "peach" };
const TYPE_LABEL: Record<CalendarItem["type"], string> = { event: "Events", holiday: "Holidays", exam: "Exams", ptm: "Parent-teacher meetings", ptm_slot: "My meetings" };

/**
 * SCR-246, live: the combined calendar feed (events, holidays, exams,
 * parent-teacher meetings). Staff read GET /api/v1/school/calendar, where
 * drafts show too; a parent reads GET /api/v1/parent/me/calendar.
 */
export function EventsCalendar() {
  const router = useRouter();
  const role = useRole();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const first = new Date(ym.y, ym.m, 1);
  const last = new Date(ym.y, ym.m + 1, 0);
  const feed = role === null ? null : role === "parent" ? "/api/v1/parent/me/calendar" : "/api/v1/school/calendar";
  const res = useApi<CalendarItem[]>(feed, { start: isoDay(first), end: isoDay(last) });

  const shown = useMemo(
    () =>
      (res.data ?? []).filter(
        (it) =>
          (!type || it.type === type) &&
          (!status || (status === "cancelled" ? it.is_cancelled : status === "draft" ? it.is_draft && !it.is_cancelled : !it.is_draft && !it.is_cancelled)),
      ),
    [res.data, type, status],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of shown) {
      const d = new Date(it.start_date + "T00:00:00");
      const end = new Date(it.end_date + "T00:00:00");
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        const k = isoDay(d);
        map.set(k, [...(map.get(k) ?? []), it]);
      }
    }
    return map;
  }, [shown]);

  // Monday-first grid with the neighbouring months' days greyed out.
  const cells: { key: string; day: number; outside: boolean }[] = [];
  const lead = (first.getDay() + 6) % 7;
  for (let i = lead; i > 0; i--) {
    const d = new Date(ym.y, ym.m, 1 - i);
    cells.push({ key: isoDay(d), day: d.getDate(), outside: true });
  }
  for (let d = 1; d <= last.getDate(); d++) cells.push({ key: isoDay(new Date(ym.y, ym.m, d)), day: d, outside: false });
  for (let i = 1; cells.length % 7; i++) {
    const d = new Date(ym.y, ym.m + 1, i);
    cells.push({ key: isoDay(d), day: d.getDate(), outside: true });
  }

  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const today = isoDay(now);
  const staff = role !== null && role !== "parent" && role !== "student";

  function open(it: CalendarItem) {
    if (it.type === "event" && staff) router.push(`${routeOf(248)}?id=${it.id}`);
    else if (it.type === "event" && role === "parent") router.push(routeOf(249));
    else if (it.type === "ptm" || it.type === "ptm_slot") router.push(`${routeOf(251)}${staff && it.type === "ptm" ? `?id=${it.id}` : ""}`);
  }

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(["event", "holiday", "exam", "ptm", "ptm_slot"] as const).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          {staff ? <option value="draft">Draft</option> : null}
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" className="btn" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <button type="button" className="btn" aria-label="Next month" onClick={() => shift(1)}>
          ›
        </button>
        <label className="btn">
          <Icon name="calendar" className="sm" />
          <input
            type="month"
            aria-label="Choose month"
            value={`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (y && m) setYm({ y, m: m - 1 });
            }}
            style={{ border: 0, background: "transparent", font: "inherit" }}
          />
        </label>
      </div>
      <ErrorNote>{res.error}</ErrorNote>
      <Panel
        title={`${MONTHS[ym.m]} ${ym.y}`}
        sub={`${res.loading ? "Loading…" : `${shown.length} item${shown.length === 1 ? "" : "s"} this month`}${staff ? " · Drafts show only to staff" : ""}`}
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
            {cells.map((c) => {
              const list = c.outside ? [] : (byDate.get(c.key) ?? []);
              return (
                <div key={c.key} className={`calendar-day ${c.outside ? "outside" : ""} ${c.key === today ? "today" : ""}`}>
                  <strong>{c.day}</strong>
                  {list.slice(0, 3).map((it) => (
                    <button
                      key={`${it.type}-${it.id}`}
                      type="button"
                      className={`cal-event ${TONE[it.type]}`}
                      title={[it.title, it.detail, it.is_draft ? "Draft" : "", it.is_cancelled ? "Cancelled" : ""].filter(Boolean).join(" · ")}
                      style={it.is_cancelled ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
                      onClick={() => open(it)}
                    >
                      {it.is_draft ? `${it.title} (draft)` : it.title}
                      <br />
                      {it.start_time ? `${hhmm(it.start_time)}${it.end_time ? `–${hhmm(it.end_time)}` : ""}` : "All day"}
                    </button>
                  ))}
                  {list.length > 3 ? <small className="muted">{`+${list.length - 3} more`}</small> : null}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      {!res.loading && !shown.length && !res.error ? <p className="muted small" style={{ marginTop: 12 }}>Nothing is scheduled this month.</p> : null}
    </>
  );
}
