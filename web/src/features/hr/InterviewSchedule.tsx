"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Application, DirectoryPerson, InterviewWindow } from "./types";
import { Dialog, Field, clock, today, useNewFlag } from "./ui";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TONES = ["", "mint", "peach"];

/** The Monday-first weeks covering a month, as local dates. */
function monthGrid(year: number, month: number): Date[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const weeks = Math.ceil((lead + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => new Date(year, month, 1 - lead + i));
}

/**
 * SCR-176, live: GET /api/v1/school/ops/interviews?from=&to= for the month
 * shown (one query for the window). Scheduling picks an application and
 * posts to /hr/applications/{id}/interviews.
 */
export function InterviewSchedule() {
  const router = useRouter();
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [opening, setOpening] = useState("");
  const [mode, setMode] = useState("");
  const [year, month] = ym;
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const from = today(cells[0]);
  const to = today(cells[cells.length - 1]);
  const win = useApi<InterviewWindow>("/api/v1/school/ops/interviews", { from, to });
  const [scheduling, closeScheduling] = useNewFlag();
  const apps = useApi<Application[]>(scheduling ? "/api/v1/school/hr/applications" : null);
  const people = useApi<DirectoryPerson[]>(scheduling ? "/api/v1/school/directory/staff" : null);
  const [panel, setPanel] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const all = win.data?.interviews ?? [];
  const openings = Array.from(new Set(all.map((i) => i.opening_title).filter(Boolean))) as string[];
  const shown = all.filter((i) => (!opening || i.opening_title === opening) && (!mode || i.mode === mode));
  const byDay = new Map<string, typeof shown>();
  shown.forEach((i) => {
    const k = today(new Date(i.scheduled_at));
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  });
  const title = new Date(year, month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const shift = (d: number) => setYm(([y, m]) => [new Date(y, m + d, 1).getFullYear(), new Date(y, m + d, 1).getMonth()]);

  async function schedule(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    setErr(null);
    setBusy(true);
    try {
      await api.post(`/api/v1/school/hr/applications/${f.get("application_id")}/interviews`, {
        scheduled_at: new Date(String(f.get("scheduled_at"))).toISOString(),
        minutes: Number(f.get("minutes")) || 30,
        mode: String(f.get("mode") ?? "in_person"),
        place_or_link: String(f.get("place_or_link") ?? "").trim() || null,
        panel_user_ids: panel,
      });
      notify("Interview scheduled and the panel told.");
      setPanel([]);
      closeScheduling();
      win.reload();
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  const active = (apps.data ?? []).filter((a) => !["hired", "rejected", "withdrawn"].includes(a.stage));

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by opening" value={opening} onChange={(e) => setOpening(e.target.value)}>
          <option value="">All openings</option>
          {openings.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select aria-label="Filter by mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All modes</option>
          <option value="in_person">In person</option>
          <option value="phone">Phone</option>
          <option value="video">Video call</option>
        </select>
        <button type="button" className="btn" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <button type="button" className="btn" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <ErrorNote>{win.error}</ErrorNote>
      <Panel
        title={title}
        sub={`${win.loading ? "Loading…" : `${shown.length} interview(s) this view`} · Times in your time zone`}
        action={
          <button type="button" className="btn" onClick={() => setYm([now.getFullYear(), now.getMonth()])}>
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
            {cells.map((d) => {
              const k = today(d);
              return (
                <div className={`calendar-day ${d.getMonth() !== month ? "outside" : ""}`} key={k}>
                  <strong>{d.getDate()}</strong>
                  {(byDay.get(k) ?? []).map((i, n) => (
                    <button
                      type="button"
                      key={i.interview_id}
                      className={`cal-event ${TONES[n % 3]}`}
                      title={[i.opening_title, `Round ${i.round_no}`, `${i.minutes} min`, label(i.mode), i.place_or_link].filter(Boolean).join(" · ")}
                      onClick={() => router.push(`${routeOf(175)}?id=${i.application_id}`)}
                    >
                      {`${i.candidate_name ?? "Candidate"} · Round ${i.round_no}`}
                      <br />
                      {clock(i.scheduled_at)}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {scheduling ? (
        <Dialog title="Schedule interview" onClose={closeScheduling} onSubmit={schedule} submit="Schedule" busy={busy} error={err ?? apps.error} wide>
          <div className="form-grid">
            <Field label="Candidate" required full>
              <select name="application_id" required defaultValue="">
                <option value="">{apps.loading ? "Loading applications…" : "Select an application"}</option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.candidate_name} · ${a.opening_title} (${label(a.stage)})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="When" required>
              <input name="scheduled_at" type="datetime-local" required defaultValue={`${today()}T10:00`} />
            </Field>
            <Field label="Minutes">
              <input name="minutes" type="number" min={5} max={480} defaultValue={45} />
            </Field>
            <Field label="Mode">
              <select name="mode" defaultValue="in_person">
                <option value="in_person">In person</option>
                <option value="phone">Phone</option>
                <option value="video">Video call</option>
              </select>
            </Field>
            <Field label="Where or meeting link">
              <input name="place_or_link" maxLength={300} />
            </Field>
            <div className="field full">
              <span>Panel</span>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                {people.data?.map((p) => (
                  <label key={p.user_id} className="row small" style={{ gap: 4 }}>
                    <input type="checkbox" checked={panel.includes(p.user_id)} onChange={(e) => setPanel(e.target.checked ? [...panel, p.user_id] : panel.filter((x) => x !== p.user_id))} />
                    {p.full_name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
