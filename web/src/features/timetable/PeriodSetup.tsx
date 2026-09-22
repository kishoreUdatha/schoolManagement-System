"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { DAY_NAME, span } from "./shared";
import type { Period } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-122, live: GET /school/periods; POST to add a slot, PATCH
 * /periods/{id} (?id=) to change its times, label or kind, DELETE to remove.
 * Day and sequence fix a slot's place, so they are set only when adding.
 */
export function PeriodSetup() {
  const router = useRouter();
  const id = Number(useSearchParams().get("id")) || null;
  const periods = useApi<Period[]>("/api/v1/school/periods");
  const existing = id ? periods.data?.find((p) => p.id === id) : undefined;
  const editing = Boolean(existing);

  const [day, setDay] = useState(1);
  const [form, setForm] = useState({ label: "Period 1", start_time: "08:30", end_time: "09:15", is_break: false, period_number: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the slot being edited, or suggest the next free number on the day.
  useEffect(() => {
    if (existing) {
      setDay(existing.day_of_week);
      setForm({
        label: existing.label ?? "",
        start_time: existing.start_time.slice(0, 5),
        end_time: existing.end_time.slice(0, 5),
        is_break: existing.is_break,
        period_number: existing.period_number,
      });
    }
  }, [existing]);

  const all = periods.data ?? [];
  const onDay = all.filter((p) => p.day_of_week === day).sort((a, b) => a.period_number - b.period_number);

  useEffect(() => {
    if (editing || !periods.data) return;
    const list = periods.data.filter((p) => p.day_of_week === day);
    const next = list.length ? Math.max(...list.map((p) => p.period_number)) + 1 : 1;
    const last = list.sort((a, b) => b.period_number - a.period_number)[0];
    setForm((f) => ({ ...f, period_number: next, label: `Period ${next}`, start_time: last ? last.end_time.slice(0, 5) : f.start_time }));
  }, [day, periods.data, editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.end_time <= form.start_time) {
      setError("End time must be after the start time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing && existing) {
        await api.patch(`/api/v1/school/periods/${existing.id}`, {
          start_time: form.start_time,
          end_time: form.end_time,
          label: form.label.trim() || null,
          is_break: form.is_break,
        });
        notify("Period updated.");
        router.push(routeOf(122));
      } else {
        await api.post("/api/v1/school/periods", {
          day_of_week: day,
          period_number: form.period_number,
          start_time: form.start_time,
          end_time: form.end_time,
          label: form.label.trim() || null,
          is_break: form.is_break,
        });
        notify(`${DAY_NAME[day]} period ${form.period_number} added.`);
      }
      periods.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Period) {
    if (!(await ask(`Delete ${DAY_NAME[p.day_of_week]} period ${p.period_number}? This removes it from all section timetables.`))) return;
    try {
      await api.delete(`/api/v1/school/periods/${p.id}`);
      notify(`Deleted ${DAY_NAME[p.day_of_week]} period ${p.period_number}.`);
      if (p.id === id) router.push(routeOf(122));
      periods.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const teaching = all.filter((p) => !p.is_break).length;
  const days = new Set(all.map((p) => p.day_of_week)).size;

  return (
    <div className="two-col">
      <form id="period-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? periods.error ?? (id && periods.data && !existing ? "That period no longer exists." : null)}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>{editing ? `Edit ${DAY_NAME[day]} period ${form.period_number}` : "Details"}</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Period name
                    <span className="req">*</span>
                  </span>
                  <input type="text" placeholder="Period 1, Lunch break, …" maxLength={60} required value={form.label} onChange={(e) => set("label", e.target.value)} />
                </label>
                <label className="field">
                  <span>
                    Start time
                    <span className="req">*</span>
                  </span>
                  <input type="time" required value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
                </label>
                <label className="field">
                  <span>
                    End time
                    <span className="req">*</span>
                  </span>
                  <input type="time" required value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
                </label>
                <label className="field">
                  <span>
                    Period type
                    <span className="req">*</span>
                  </span>
                  <select required value={form.is_break ? "break" : "teaching"} onChange={(e) => set("is_break", e.target.value === "break")}>
                    <option value="teaching">Teaching period</option>
                    <option value="break">Break (lunch, recess)</option>
                  </select>
                </label>
                {/* The mock's "School level": periods are school-wide in the API, set per weekday instead. */}
                <label className="field">
                  <span>
                    Day
                    <span className="req">*</span>
                  </span>
                  <select value={day} disabled={editing} onChange={(e) => setDay(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <option key={d} value={d}>
                        {DAY_NAME[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Sequence
                    <span className="req">*</span>
                  </span>
                  <input type="number" min={1} max={20} required disabled={editing} value={form.period_number} onChange={(e) => set("period_number", Number(e.target.value))} />
                </label>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => (editing ? router.push(routeOf(122)) : router.back())}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save period"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Timetable</h3>
          <dl className="kv">
            <div>
              <dt>Slots defined</dt>
              <dd>{periods.data ? `${all.length} across ${days} day${days === 1 ? "" : "s"}` : "…"}</dd>
            </div>
            <div>
              <dt>Teaching periods</dt>
              <dd>{periods.data ? teaching : "…"}</dd>
            </div>
            <div>
              <dt>Breaks</dt>
              <dd>{periods.data ? all.length - teaching : "…"}</dd>
            </div>
          </dl>
          <div className="gap" />
          <p>Periods are school-wide: every section&apos;s timetable is built on these slots.</p>
        </div>
        <div className="aside-panel">
          <h3>{`${DAY_NAME[day]}’s periods`}</h3>
          {onDay.length ? (
            onDay.map((p) => (
              <div className="spread" key={p.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <div>
                  <strong>{`${p.period_number}. ${p.label ?? `Period ${p.period_number}`}`}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{`${span(p.start_time, p.end_time)}${p.is_break ? " · break" : ""}`}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Link className="btn text" href={`${routeOf(122)}?id=${p.id}`}>
                    Edit
                  </Link>
                  <button type="button" className="btn text" onClick={() => remove(p)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">{periods.loading ? "Loading…" : "No periods on this day yet."}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
