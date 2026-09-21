"use client";

import { useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, confirmed, formText, today, useNewFlag } from "@/features/transport/kit";

const HOLIDAYS = "/api/v1/school/holidays";

type HolidayType = "national" | "school" | "vacation";
export type Holiday = { id: number; name: string; type: HolidayType; start_date: string; end_date: string; days: number; created_at: string };

const TYPE_LABEL: Record<HolidayType, string> = { national: "National holiday", school: "School holiday", vacation: "Vacation" };
const TYPE_TONE: Record<HolidayType, string> = { national: "peach", school: "mint", vacation: "" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const span = (h: Holiday) => (h.start_date === h.end_date ? date(h.start_date) : `${date(h.start_date)} – ${date(h.end_date)}`);

/**
 * NEW-020, live: GET /api/v1/school/holidays (?year=) shown as a month
 * calendar and a list for the year; POST /holidays, PATCH and DELETE
 * /holidays/{id} from the dialog.
 */
export function Holidays() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [adding, closeAdd] = useNewFlag();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const year = useApi<Holiday[]>(HOLIDAYS, { year: ym.y, limit: 200 });
  const upcoming = useApi<Holiday[]>(HOLIDAYS, { upcoming: true, limit: 1 });
  const all = useMemo(() => [...(year.data ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date)), [year.data]);
  const items = all.filter((h) => !type || h.type === type);

  // Each day a holiday covers, for the month grid.
  const byDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of items) {
      const d = new Date(`${h.start_date}T00:00:00`);
      const end = new Date(`${h.end_date}T00:00:00`);
      for (; d <= end; d.setDate(d.getDate() + 1)) map.set(iso(d), [...(map.get(iso(d)) ?? []), h]);
    }
    return map;
  }, [items]);

  const first = new Date(ym.y, ym.m, 1);
  const last = new Date(ym.y, ym.m + 1, 0);
  const cells: { key: string; day: number; outside: boolean }[] = [];
  for (let i = (first.getDay() + 6) % 7; i > 0; i--) {
    const d = new Date(ym.y, ym.m, 1 - i);
    cells.push({ key: iso(d), day: d.getDate(), outside: true });
  }
  for (let d = 1; d <= last.getDate(); d++) cells.push({ key: iso(new Date(ym.y, ym.m, d)), day: d, outside: false });
  for (let d = 1; cells.length % 7; d++) cells.push({ key: iso(new Date(ym.y, ym.m + 1, d)), day: d, outside: true });
  const shift = (n: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const monthKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const inMonth = items.filter((h) => h.start_date.slice(0, 7) <= monthKey && h.end_date.slice(0, 7) >= monthKey);

  const next = upcoming.data?.[0];
  const stats = [
    { label: "Holidays", value: year.data ? String(all.length) : "…", note: `In ${ym.y}` },
    { label: "Days off", value: year.data ? String(all.reduce((s, h) => s + h.days, 0)) : "…", note: "Calendar days covered" },
    { label: "Vacations", value: year.data ? String(all.filter((h) => h.type === "vacation").length) : "…", note: "Longer breaks" },
    { label: "Next holiday", value: next ? date(next.start_date).slice(0, 6) : upcoming.data ? "—" : "…", note: next ? next.name : "Nothing coming up" },
  ];

  const open = adding || editing !== null;
  const close = () => {
    setError(null);
    setEditing(null);
    if (adding) closeAdd();
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const body = { name: formText(f, "name"), type: formText(f, "type"), start_date: formText(f, "start_date"), end_date: formText(f, "end_date") ?? formText(f, "start_date") };
    if (body.end_date && body.start_date && body.end_date < body.start_date) {
      setError("The last day cannot be before the first day.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`${HOLIDAYS}/${editing.id}`, body);
        notify(`${body.name} updated.`);
      } else {
        await api.post(HOLIDAYS, body);
        notify(`${body.name} added to the calendar.`);
      }
      close();
      year.reload();
      upcoming.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(h: Holiday) {
    if (!confirmed(`Delete “${h.name}” (${span(h)})? Those days will count as school days again.`)) return;
    setError(null);
    try {
      await api.delete(`${HOLIDAYS}/${h.id}`);
      notify(`${h.name} deleted.`);
      close();
      year.reload();
      upcoming.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const rows: Row[] = items.map((h) => [h.name, TYPE_LABEL[h.type], date(h.start_date), date(h.end_date), String(h.days)]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All holiday types</option>
          {Object.entries(TYPE_LABEL).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="btn" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <label className="btn" style={{ gap: 8 }}>
          <Icon name="calendar" className="sm" />
          <input
            type="month"
            aria-label="Month"
            value={monthKey}
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
      <ErrorNote>{!open ? (error ?? year.error) : year.error}</ErrorNote>
      <div className="two-col">
        <Panel
          title={`${MONTHS[ym.m]} ${ym.y}`}
          sub={`${inMonth.length} holiday(s) this month${year.loading ? " · Loading…" : ""}`}
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
                <div key={c.key} className={`calendar-day ${c.outside ? "outside" : ""} ${c.key === today() ? "today" : ""}`}>
                  <strong>{c.day}</strong>
                  {c.outside
                    ? null
                    : (byDate.get(c.key) ?? []).slice(0, 2).map((h) => (
                        <button type="button" key={h.id} className={`cal-event ${TYPE_TONE[h.type]}`} onClick={() => setEditing(h)}>
                          {h.name}
                        </button>
                      ))}
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <aside className="stack">
          <div className="aside-panel">
            <h3>This month</h3>
            {inMonth.length ? (
              inMonth.map((h) => (
                <div className="event-row" key={h.id}>
                  <div className="calendar-tile">
                    {Number(h.start_date.slice(8, 10))}
                    <small>{MONTHS[Number(h.start_date.slice(5, 7)) - 1].slice(0, 3)}</small>
                  </div>
                  <div className="event-content">
                    <h4>{h.name}</h4>
                    <p>{`${TYPE_LABEL[h.type]} · ${h.days} day(s)`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p>{year.loading ? "Loading…" : "No holidays this month."}</p>
            )}
            <div className="gap" />
            <p>Attendance is not taken on a holiday, and holidays appear on the school calendar.</p>
          </div>
        </aside>
      </div>
      <div className="gap" />
      <Panel title={`Holidays in ${ym.y}`} sub={`${items.length} shown`} flush>
        <DataTable
          columns={["Holiday", "Type", "From", "To", "Days"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => setEditing(items[i])}>
                Edit
              </button>
              <button type="button" className="btn" onClick={() => remove(items[i])}>
                Delete
              </button>
            </>
          )}
          empty={year.loading ? "Loading holidays…" : type ? "No holidays of this type this year." : `No holidays recorded for ${ym.y}. Add the first one.`}
        />
      </Panel>
      <Dialog
        open={open}
        title={editing ? `Edit · ${editing.name}` : "Add holiday"}
        onClose={close}
        onSubmit={save}
        actions={
          <>
            {editing ? (
              <button type="button" className="btn" onClick={() => remove(editing)}>
                Delete
              </button>
            ) : null}
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save holiday"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid" key={editing?.id ?? "new"}>
          <Field label="Name" required full>
            <input name="name" required minLength={1} maxLength={160} defaultValue={editing?.name ?? ""} placeholder="e.g. Diwali" />
          </Field>
          <Field label="Type" required>
            <select name="type" required defaultValue={editing?.type ?? "school"}>
              {Object.entries(TYPE_LABEL).map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="First day" required>
            <input type="date" name="start_date" required defaultValue={editing?.start_date ?? ""} />
          </Field>
          <Field label="Last day">
            <input type="date" name="end_date" defaultValue={editing?.end_date ?? ""} />
          </Field>
        </div>
        <p className="muted small">Leave the last day blank for a one-day holiday.</p>
      </Dialog>
    </>
  );
}
