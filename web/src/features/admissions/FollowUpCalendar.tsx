"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { ENQ, todayIso } from "./shared";
import { SOURCES, STAGES, type Enquiry } from "./types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TONES = ["", "mint", "peach"];

/** A page-head link that opens the schedule form, keeping ?id= when there is one. */
export function ScheduleLink({ primary = true }: { primary?: boolean }) {
  const id = useSearchParams().get("id");
  return (
    <Link href={`${routeOf(47)}?schedule=${id ?? "new"}`} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name="calendar" className="sm" />
      Schedule follow-up
    </Link>
  );
}

/**
 * SCR-047, live: GET /admissions/enquiries?open_only=true, placed on the
 * month by next_follow_up_date. Scheduling posts an activity with the next
 * date (POST /enquiries/{id}/activities).
 */
export function FollowUpCalendar() {
  const router = useRouter();
  const params = useSearchParams();
  const schedule = params.get("schedule");
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const list = useApi<Paginated<Enquiry>>(ENQ, { open_only: true, stage, source, page_size: 200 });
  const today = todayIso();

  const byDay = useMemo(() => {
    const m = new Map<string, Enquiry[]>();
    list.data?.items.forEach((e) => {
      if (!e.next_follow_up_date) return;
      const k = e.next_follow_up_date.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), e]);
    });
    return m;
  }, [list.data]);

  // Monday-first grid: the tail of last month, this month, the head of next.
  const first = new Date(month.y, month.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells: { iso: string; day: number; outside: boolean }[] = [];
  for (let i = -lead; i < days; i++) {
    const d = new Date(month.y, month.m, i + 1);
    cells.push({ iso: todayIso(d), day: d.getDate(), outside: i < 0 });
  }
  while (cells.length % 7) {
    const d = new Date(month.y, month.m, days + (cells.length - lead - days) + 1);
    cells.push({ iso: todayIso(d), day: d.getDate(), outside: true });
  }

  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const overdue = list.data?.items.filter((e) => e.next_follow_up_date && e.next_follow_up_date < today).length ?? 0;

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All open stages</option>
          {STAGES.filter((s) => s !== "enrolled" && s !== "lost").map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <button type="button" className="btn" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {schedule ? <ScheduleForm preset={schedule} items={list.data?.items ?? []} onDone={() => { list.reload(); router.replace(routeOf(47)); }} /> : null}
      <Panel
        title={`${MONTHS[month.m]} ${month.y}`}
        sub={`Open enquiries with a follow-up date${overdue ? ` · ${overdue} overdue` : ""}${list.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>
            Today
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <div className="calendar-grid">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
              <div className="day-head" key={d}>
                {d}
              </div>
            ))}
            {cells.map((c) => (
              <div key={c.iso} className={`calendar-day ${c.outside ? "outside" : ""} ${c.iso === today ? "today" : ""}`}>
                <strong>{c.day}</strong>
                {(byDay.get(c.iso) ?? []).map((e, i) => (
                  <button
                    type="button"
                    key={e.id}
                    className={`cal-event ${c.iso < today ? "peach" : TONES[i % 3]}`}
                    onClick={() => router.push(`${routeOf(46)}?id=${e.id}`)}
                  >
                    {`${e.student_name} · Follow-up`}
                    <br />
                    {label(e.stage)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}

function ScheduleForm({ preset, items, onDone }: { preset: string; items: Enquiry[]; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = items.some((e) => String(e.id) === preset);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.post(`${ENQ}/${f.get("enquiry")}/activities`, {
        kind: String(f.get("kind")),
        note: String(f.get("note")).trim(),
        next_follow_up_date: String(f.get("date")),
      });
      notify(`Follow-up scheduled for ${date(String(f.get("date")))}.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <div>
          <h2>Schedule follow-up</h2>
          <p>Logs the contact and sets the next follow-up date</p>
        </div>
      </div>
      <div className="panel-body">
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <label className="field">
            <span>
              Enquiry
              <span className="req">*</span>
            </span>
            <select name="enquiry" required defaultValue={known ? preset : ""} key={items.length}>
              <option value="">Select enquiry</option>
              {items.map((e) => (
                <option key={e.id} value={e.id}>
                  {`${e.student_name} · ${e.parent_name}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Follow-up date
              <span className="req">*</span>
            </span>
            <input type="date" name="date" required min={todayIso()} />
          </label>
          <label className="field">
            <span>Contact made</span>
            <select name="kind" defaultValue="call">
              {["call", "visit", "email", "whatsapp", "note"].map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Note
              <span className="req">*</span>
            </span>
            <input name="note" required placeholder="What was discussed?" />
          </label>
        </div>
        <div className="gap" />
        <div className="actions">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Schedule follow-up"}
          </button>
        </div>
      </div>
    </form>
  );
}
