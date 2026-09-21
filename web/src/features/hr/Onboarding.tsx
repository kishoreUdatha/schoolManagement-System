"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { Checklist, StaffMember, Starter } from "./types";
import { Dialog, Field, KV, today, useNewFlag } from "./ui";

const BASE = "/api/v1/school/hr-ops/onboarding";
const AREAS = ["hr", "it", "payroll", "workspace", "induction", "safeguarding", "library"];

/**
 * SCR-178, live: GET /api/v1/school/hr-ops/onboarding/outstanding for the
 * starters with work left, GET /onboarding/{staff_id} for one checklist,
 * POST /onboarding/{staff_id} to start the standard list (nothing assumed
 * done), POST /onboarding/{staff_id}/tasks to add one, POST
 * /onboarding/tasks/{id} to tick or untick.
 */
export function Onboarding() {
  const router = useRouter();
  const path = usePathname();
  const id = useSearchParams().get("id");
  const outstanding = useApi<{ starters: Starter[]; count: number; with_overdue: number }>(`${BASE}/outstanding`);
  const staff = useApi<StaffMember[]>("/api/v1/school/staff", { status: "active" });
  const list = useApi<Checklist>(id ? `${BASE}/${id}` : null);
  const [adding, closeAdding] = useNewFlag();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dueOn, setDueOn] = useState("");

  const pick = (staffId: string) => router.replace(staffId ? `${path}?id=${staffId}` : path, { scroll: false });

  async function run(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      notify(done);
      list.reload();
      outstanding.reload();
      return true;
    } catch (e) {
      setErr(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTask(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    if (!id) {
      setErr("Choose an employee first.");
      return;
    }
    const ok = await run(
      () =>
        api.post(`${BASE}/${id}/tasks`, {
          title: String(f.get("title") ?? "").trim(),
          area: String(f.get("area") ?? "hr"),
          due_on: String(f.get("due_on") ?? "") || null,
          note: String(f.get("note") ?? "").trim() || null,
        }),
      "Task added.",
    );
    if (ok) closeAdding();
  }

  const c = list.data;
  const member = staff.data?.find((s) => String(s.id) === id);
  const starters = outstanding.data?.starters ?? [];
  const pctDone = c && c.total ? Math.round((c.done / c.total) * 100) : 0;

  return (
    <>
      <div className="filterbar">
        <select aria-label="Employee" value={id ?? ""} onChange={(e) => pick(e.target.value)}>
          <option value="">Choose an employee…</option>
          {starters.length ? (
            <optgroup label="Checklists with work left">
              {starters.map((s) => (
                <option key={`o${s.staff_id}`} value={s.staff_id}>
                  {`${s.full_name ?? "—"} · ${s.outstanding} left${s.overdue ? `, ${s.overdue} overdue` : ""}`}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="All active staff">
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.full_name} · ${s.employee_no}`}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="muted small">
          {outstanding.data ? `${outstanding.data.count} starter(s) with work left · ${outstanding.data.with_overdue} with something overdue` : "Loading…"}
        </span>
      </div>
      <ErrorNote>{err ?? list.error ?? outstanding.error}</ErrorNote>
      <div className="two-col">
        <div>
          <Panel title="Employee checklist">
            {!id ? (
              <p className="muted">Choose an employee to see their onboarding checklist.</p>
            ) : !c ? (
              <p className="muted">{list.loading ? "Loading the checklist…" : "No checklist found."}</p>
            ) : (
              <>
                <div className="person">
                  <span className="avatar mint">{initials(c.full_name ?? "?")}</span>
                  <div>
                    {c.full_name ?? "—"}
                    <small>{[c.designation, c.employee_no].filter(Boolean).join(" · ")}</small>
                  </div>
                </div>
                <div className="gap" />
                {!c.started ? (
                  <div className="stack">
                    <p className="muted">No checklist has been started for this employee. Starting one lays out the standard tasks for every area; none is marked done.</p>
                    <div className="row">
                      <label className="field">
                        <span>Due by</span>
                        <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
                      </label>
                      <button type="button" className="btn primary" disabled={busy} onClick={() => run(() => api.post(`${BASE}/${c.staff_id}`, { due_on: dueOn || null }), "Checklist started — nothing is assumed done.")}>
                        Start the checklist
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="checklist">
                    {c.tasks.map((t) => {
                      const overdue = !t.is_done && t.due_on && t.due_on < today();
                      return (
                        <div className="check-item" key={t.id}>
                          <input
                            type="checkbox"
                            aria-label={t.title}
                            checked={t.is_done}
                            disabled={busy}
                            onChange={() => run(() => api.post(`${BASE}/tasks/${t.id}`, { is_done: !t.is_done }), t.is_done ? `${t.title} put back.` : `${t.title} done.`)}
                          />
                          <label>
                            <strong>{t.title}</strong>
                            <small>
                              {t.is_done
                                ? `Completed ${dateTime(t.done_at)}${t.done_by ? ` by ${t.done_by}` : ""}`
                                : `${label(t.area)}${t.due_on ? ` · due ${date(t.due_on)}` : ""}${t.note ? ` · ${t.note}` : ""}`}
                            </small>
                          </label>
                          <Badge>{t.is_done ? "Done" : overdue ? "Overdue" : "Pending"}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Completion">
            <div className="donut" style={{ background: `conic-gradient(#2563eb 0 ${pctDone}%,#e9eff9 ${pctDone}%)` }}>
              <div>
                {c?.started ? `${pctDone}%` : "—"}
                <small>{c?.started ? `${c.done} of ${c.total} completed` : "Not started"}</small>
              </div>
            </div>
          </Panel>
          <Panel title="Employee details">
            <KV
              rows={[
                ["Department", member?.department_name ?? "—"],
                ["Designation", c?.designation ?? member?.designation ?? "—"],
                ["Joining date", date(c?.joining_date ?? member?.joining_date)],
                ["Overdue tasks", c?.started ? String(c.overdue) : "—"],
                // Not wired: Reporting manager — the staff record has no manager field.
              ]}
            />
          </Panel>
        </aside>
      </div>

      {adding ? (
        <Dialog title="Add a task" onClose={closeAdding} onSubmit={addTask} submit="Add task" busy={busy} error={err}>
          {!id ? <p>Choose an employee first.</p> : null}
          <div className="form-grid">
            <Field label="Task" required full>
              <input name="title" required maxLength={200} />
            </Field>
            <Field label="Area">
              <select name="area" defaultValue="hr">
                {AREAS.map((x) => (
                  <option key={x} value={x}>
                    {x === "hr" || x === "it" ? x.toUpperCase() : label(x)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due by">
              <input name="due_on" type="date" />
            </Field>
            <Field label="Note" full>
              <input name="note" maxLength={300} />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
