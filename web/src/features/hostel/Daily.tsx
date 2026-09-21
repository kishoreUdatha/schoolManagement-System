"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Avatar, Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, SearchBox, StudentPicker, formText, today, type PickedStudent } from "@/features/transport/kit";
import { HOSTELS, NoHostel, useAddDialog, useHostel } from "./Setup";
import type { Complaint, Meal, MenuSlot, Outing, Resident, RollStatus } from "./types";

const ROLL: Record<RollStatus, [string, string]> = { present: ["Present", "present"], absent: ["Absent", "absent"], on_leave: ["Leave", "leave"] };

/** SCR-212, live: GET /hostels/{id}/residents?on= and POST /hostels/{id}/roll-call (morning or night). */
export function HostelAttendance() {
  const { hostels, hostel, select } = useHostel();
  const [day, setDay] = useState(today());
  const [session, setSession] = useState<"morning" | "night">(() => (new Date().getHours() < 14 ? "morning" : "night"));
  const residents = useApi<Resident[]>(hostel ? `${HOSTELS}/${hostel.id}/residents` : null, { on: day });
  const [marks, setMarks] = useState<Record<number, RollStatus>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = residents.data;

  useEffect(() => {
    if (list) setMarks(Object.fromEntries(list.map((r) => [r.student_id, r.today[session] ?? (r.out_now ? "on_leave" : "present")])));
  }, [list, session]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, on_leave: 0 };
    Object.values(marks).forEach((m) => (c[m] += 1));
    return c;
  }, [marks]);
  const saved = list?.filter((r) => r.today[session]).length ?? 0;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hostel || !list?.length) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ marked: number }>(`${HOSTELS}/${hostel.id}/roll-call`, { date: day, session, marks: list.map((x) => ({ student_id: x.student_id, status: marks[x.student_id] ?? "present" })) });
      notify(`${label(session)} roll call saved (${r.marked ?? list.length} marked).`);
      residents.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="roll-form" onSubmit={save}>
      <div className="filterbar">
        {select}
        <select aria-label="Roll call session" value={session} onChange={(e) => setSession(e.target.value as "morning" | "night")}>
          <option value="morning">Morning roll call</option>
          <option value="night">Night roll call</option>
        </select>
        <input type="date" aria-label="Date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} />
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Choose a status for each resident, then save the register. Students signed out on an outing start as Leave.</span>
      </div>
      <ErrorNote>{error ?? hostels.error ?? residents.error}</ErrorNote>
      {!hostel ? (
        <NoHostel loading={hostels.loading} />
      ) : (
        <Panel
          title={`${hostel.name} · ${session === "morning" ? "Morning" : "Night"} session`}
          sub={date(day)}
          action={
            <button type="button" className="btn" onClick={() => setMarks(Object.fromEntries((list ?? []).map((r) => [r.student_id, "present"])))}>
              <Icon name="check" className="sm" />
              Mark all present
            </button>
          }
          flush
        >
          <div className="approval-summary">
            <strong>{`${counts.present} Present   ${counts.absent} Absent   ${counts.on_leave} Leave`}</strong>
            <span>{`${list?.length ?? 0} resident(s) · ${saved} already saved for this session`}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Room / bed</th>
                  <th>Status</th>
                  <th>Out now</th>
                </tr>
              </thead>
              <tbody>
                {(list ?? []).map((r, i) => {
                  const m = marks[r.student_id] ?? "present";
                  return (
                    <tr key={r.student_id}>
                      <td>
                        <div className="person">
                          <Avatar name={r.student_name} index={i} />
                          <div>
                            {r.student_name}
                            <small>{r.admission_no}</small>
                          </div>
                        </div>
                      </td>
                      <td>{`${r.room_no} / ${r.bed_label}`}</td>
                      <td>
                        <select className={`attendance-choice ${ROLL[m][1]}`} aria-label={`Attendance for ${r.student_name}`} value={m} onChange={(e) => setMarks({ ...marks, [r.student_id]: e.target.value as RollStatus })}>
                          {Object.entries(ROLL).map(([k, [t]]) => (
                            <option key={k} value={k}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{r.out_now ? "On an outing" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list && !list.length ? <div className="table-empty">No residents in this hostel.</div> : null}
          {/* Not wired: check-in time, "Late" and per-student remarks — the roll call records only present, absent or on leave. */}
        </Panel>
      )}
      <div className="form-footer" style={{ border: "0", background: "transparent" }}>
        <span>{saved ? `${saved} of ${list?.length ?? 0} saved for this session` : "Not saved yet for this session"}</span>
        <button type="submit" className="btn primary" disabled={saving || !list?.length}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </form>
  );
}

const OUT_LABEL: Record<Outing["status"], string> = { requested: "Pending", approved: "Approved", rejected: "Declined", out: "Signed out", returned: "Returned", cancelled: "Cancelled" };

/** SCR-213, live: GET /hostels/{id}/outings, POST /hostels/outings, …/decide, …/out, …/returned. */
export function LeaveOuting() {
  const { hostels, hostel, select } = useHostel();
  const [activeOnly, setActiveOnly] = useState(true);
  const outings = useApi<Outing[]>(hostel ? `${HOSTELS}/${hostel.id}/outings` : null, { active_only: activeOnly || undefined });
  const add = useAddDialog(213);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Outing | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = outings.data ?? [];
  const items = all.filter((o) => !search.trim() || `${o.student_name} ${o.reason}`.toLowerCase().includes(search.trim().toLowerCase()));
  const sel = picked ? all.find((o) => o.id === picked.id) ?? null : null;
  const requested = all.filter((o) => o.status === "requested");
  const oldest = [...requested].sort((a, b) => a.leave_at.localeCompare(b.leave_at))[0];
  const stats = [
    { label: "Awaiting review", value: String(requested.length), note: activeOnly ? "Current requests" : "In this list" },
    { label: "Out now", value: String(all.filter((o) => o.status === "out").length), note: `${all.filter((o) => o.overdue).length} overdue` },
    { label: "Approved", value: String(all.filter((o) => o.status === "approved").length), note: "Not yet signed out" },
    { label: "Earliest pending", value: oldest ? date(oldest.leave_at) : "—", note: oldest ? `Leaves ${dateTime(oldest.leave_at)}` : "Nothing waiting" },
  ];

  async function act(o: Outing, path: string, body: unknown, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await api.post(`${HOSTELS}/outings/${o.id}/${path}`, body);
      notify(msg);
      setNote("");
      outings.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (!student) throw new Error("Choose a student.");
      const iso = (k: string) => new Date(String(f.get(k))).toISOString();
      await api.post(`${HOSTELS}/outings`, { student_id: student.id, kind: formText(f, "kind"), leave_at: iso("leave_at"), return_by: iso("return_by"), reason: formText(f, "reason"), escort_name: formText(f, "escort_name") });
      notify("Request recorded.");
      setStudent(null);
      add.close();
      outings.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const buttons = (o: Outing) =>
    o.status === "requested" ? (
      <>
        <button type="button" className="btn" disabled={saving} onClick={() => act(o, "decide", { approve: false, note: note || null }, "Request declined.")}>
          Decline
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => act(o, "decide", { approve: true, note: note || null }, "Request approved.")}>
          <Icon name="check" className="sm" />
          Approve
        </button>
      </>
    ) : o.status === "approved" ? (
      <button type="button" className="btn primary" disabled={saving} onClick={() => act(o, "out", undefined, `${o.student_name} signed out.`)}>
        Signed out
      </button>
    ) : o.status === "out" ? (
      <button type="button" className="btn primary" disabled={saving} onClick={() => act(o, "returned", undefined, `${o.student_name} is back.`)}>
        Returned
      </button>
    ) : null;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search leave or outing…" />
        {select}
        <select aria-label="Filter by status" value={activeOnly ? "active" : "all"} onChange={(e) => setActiveOnly(e.target.value === "active")}>
          <option value="active">Current (pending, approved, out)</option>
          <option value="all">All requests</option>
        </select>
      </div>
      <ErrorNote>{!add.open ? (error ?? hostels.error ?? outings.error) : null}</ErrorNote>
      {!hostel ? (
        <NoHostel loading={hostels.loading} />
      ) : (
        <div className="two-col">
          <div className="panel">
            <div className="approval-summary">
              <strong>Leave and outing requests</strong>
              <span>{`${items.length} shown`}</span>
            </div>
            {items.map((o, i) => (
              <article className="request-card" key={o.id}>
                <Avatar name={o.student_name} index={i} />
                <div className="request-info">
                  <h3>{o.student_name}</h3>
                  <p>{`${o.kind === "home_leave" ? "Home leave" : "Outing"} · ${o.reason} · Out ${dateTime(o.leave_at)} · Back by ${dateTime(o.return_by)}`}</p>
                  <p>{`${o.requested_by_parent ? "Requested by parent" : `Requested by ${o.requested_by_name ?? "school"}`}${o.escort_name ? ` · Escort ${o.escort_name}` : ""}${o.overdue ? ` · Overdue${o.late_by_minutes ? ` by ${o.late_by_minutes} min` : ""}` : ""}`}</p>
                </div>
                <div className="actions">
                  <Badge>{o.overdue ? "Overdue" : OUT_LABEL[o.status]}</Badge>
                  <button type="button" className="btn" onClick={() => setPicked(o)}>
                    Review
                  </button>
                  {buttons(o)}
                </div>
              </article>
            ))}
            {!items.length ? <div className="panel-pad muted">{outings.loading ? "Loading…" : "No requests here."}</div> : null}
          </div>
          <aside className="stack">
            <Panel title="Request summary">
              {sel ? (
                <>
                  <Kv
                    rows={[
                      ["Student", sel.student_name],
                      ["Type", sel.kind === "home_leave" ? "Home leave" : "Outing"],
                      ["Reason", sel.reason],
                      ["Leaves", dateTime(sel.leave_at)],
                      ["Back by", dateTime(sel.return_by)],
                      ["Escort", sel.escort_name ?? "—"],
                      ["Status", OUT_LABEL[sel.status]],
                      ["Decision note", sel.decision_note ?? "—"],
                    ]}
                  />
                  {sel.status === "requested" ? (
                    <>
                      <div className="gap" />
                      <Field label="Note to go with the decision">
                        <input value={note} onChange={(e) => setNote(e.target.value)} />
                      </Field>
                      <div className="gap" />
                      <div className="row">{buttons(sel)}</div>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="muted">Choose Review on a request to see it here.</p>
              )}
            </Panel>
            <Panel title="Movement">
              {sel ? (
                <>
                  <div className="timeline-item">
                    <span className="timeline-dot">
                      <Icon name="file" />
                    </span>
                    <div>
                      <h4>Requested</h4>
                      <p>{sel.requested_by_parent ? "By parent" : (sel.requested_by_name ?? "By school")}</p>
                    </div>
                  </div>
                  {sel.went_out_at ? (
                    <div className="timeline-item">
                      <span className="timeline-dot">
                        <Icon name="arrow" />
                      </span>
                      <div>
                        <h4>Signed out</h4>
                        <p>{dateTime(sel.went_out_at)}</p>
                      </div>
                    </div>
                  ) : null}
                  {sel.returned_at ? (
                    <div className="timeline-item">
                      <span className="timeline-dot">
                        <Icon name="check" />
                      </span>
                      <div>
                        <h4>Returned</h4>
                        <p>{`${dateTime(sel.returned_at)}${sel.late_by_minutes ? ` · ${sel.late_by_minutes} min late` : ""}`}</p>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted">—</p>
              )}
            </Panel>
          </aside>
        </div>
      )}
      {add.open && hostel ? (
        <Modal title="New leave or outing request" onClose={add.close}>
          <form onSubmit={create}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <StudentPicker value={student} onChange={setStudent} required />
              <Field label="Type">
                <select name="kind" defaultValue="outing">
                  <option value="outing">Outing</option>
                  <option value="home_leave">Home leave</option>
                </select>
              </Field>
              <Field label="Leaves at" required>
                <input type="datetime-local" name="leave_at" required />
              </Field>
              <Field label="Back by" required>
                <input type="datetime-local" name="return_by" required />
              </Field>
              <Field label="Reason" required>
                <input name="reason" required />
              </Field>
              <Field label="Escort">
                <input name="escort_name" placeholder="Who collects the student" />
              </Field>
            </div>
            <ModalActions onClose={add.close} saving={saving} label="Record request" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS: [Meal, string][] = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["snacks", "Snack"],
  ["dinner", "Dinner"],
];

/** SCR-214, live: GET + PUT /hostels/{id}/menu (seven days, four meals). */
export function MessMenu() {
  const { hostels, hostel, select } = useHostel();
  const menu = useApi<MenuSlot[]>(hostel ? `${HOSTELS}/${hostel.id}/menu` : null);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (menu.data) setGrid(Object.fromEntries(menu.data.map((s) => [`${s.day_of_week}-${s.meal}`, s.items])));
  }, [menu.data]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hostel) return;
    const slots = Object.entries(grid)
      .filter(([, v]) => v.trim())
      .map(([k, items]) => {
        const [d, meal] = k.split("-");
        return { day_of_week: Number(d), meal, items: items.trim() };
      });
    setSaving(true);
    setError(null);
    try {
      await api.put(`${HOSTELS}/${hostel.id}/menu`, { slots });
      notify("Meal plan saved.");
      menu.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="menu-form" onSubmit={save}>
      <div className="filterbar">{select}</div>
      <ErrorNote>{error ?? hostels.error ?? menu.error}</ErrorNote>
      {!hostel ? (
        <NoHostel loading={hostels.loading} />
      ) : (
        <Panel title="Weekly meal schedule" sub={`${hostel.name} · the same menu repeats each week · edit any cell, then save`} flush>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  {MEALS.map(([, t]) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d, i) => (
                  <tr key={d}>
                    <td>{d}</td>
                    {MEALS.map(([m, t]) => (
                      <td key={m}>
                        <input className="marks-input" style={{ width: "100%", textAlign: "left" }} aria-label={`${t} on ${d}`} value={grid[`${i}-${m}`] ?? ""} onChange={(e) => setGrid({ ...grid, [`${i}-${m}`]: e.target.value })} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>{menu.loading ? "Loading…" : `${menu.data?.length ?? 0} meal slot(s) planned`}</span>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save meal plan"}
            </button>
          </div>
        </Panel>
      )}
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Individual dietary needs and allergies are managed in the student health record.</span>
      </div>
    </form>
  );
}

const COLUMNS: [Complaint["status"], string][] = [
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["resolved", "Resolved"],
];

/** SCR-215, live: GET/POST /hostels/{id}/complaints, PATCH /hostels/complaints/{id}, POST /hostels/fees/generate. */
export function ComplaintsFees() {
  const { hostels, hostel, select } = useHostel();
  const complaints = useApi<Complaint[]>(hostel ? `${HOSTELS}/${hostel.id}/complaints` : null);
  const heads = useApi<{ id: number; name: string; code: string }[]>("/api/v1/school/fees/heads");
  const add = useAddDialog(215);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Complaint | null>(null);
  const [billing, setBilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = (complaints.data ?? []).filter((c) => !search.trim() || `${c.category} ${c.description} ${c.student_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const dialog = add.open || open !== null || billing;
  const close = () => {
    setError(null);
    setStudent(null);
    setOpen(null);
    setBilling(false);
    if (add.open) add.close();
  };

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(msg);
      close();
      complaints.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => api.post(`${HOSTELS}/${hostel!.id}/complaints`, { category: formText(f, "category"), description: formText(f, "description"), student_id: student?.id ?? null }), "Complaint logged.");
  }

  function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => api.patch(`${HOSTELS}/complaints/${open!.id}`, { status: formText(f, "status"), resolution: formText(f, "resolution") }), "Complaint updated.");
  }

  function bill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    api
      .post<{ created: number; skipped: number; total_amount: string }>(`${HOSTELS}/fees/generate`, { fee_head_id: Number(f.get("fee_head_id")), period: formText(f, "period"), due_day: Number(f.get("due_day") || 10) })
      .then((r) => {
        notify(`Raised ${r.created} hostel fee(s) for ${formText(f, "period")} totalling ${money(r.total_amount)}${r.skipped ? ` · ${r.skipped} already billed` : ""}.`);
        close();
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setSaving(false));
  }

  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search hostel complaints & fees…" />
        {select}
        <button type="button" className="btn" onClick={() => setBilling(true)}>
          <Icon name="money" className="sm" />
          Raise monthly hostel fees
        </button>
      </div>
      <ErrorNote>{!dialog ? (error ?? hostels.error ?? complaints.error) : null}</ErrorNote>
      {!hostel ? (
        <NoHostel loading={hostels.loading} />
      ) : (
        <div className="kanban">
          {COLUMNS.map(([st, title]) => {
            const col = items.filter((c) => c.status === st);
            return (
              <section className="kanban-col" key={st}>
                <div className="kanban-title">
                  {title}
                  <span>{col.length}</span>
                </div>
                {col.map((c) => (
                  <article className="kanban-card" key={c.id} onClick={() => setOpen(c)} style={{ cursor: "pointer" }}>
                    <div className="spread">
                      <small>{`#${c.id}`}</small>
                      <Badge>{label(c.category)}</Badge>
                    </div>
                    <h3>{c.description}</h3>
                    <p>{[hostel.name, c.student_name, c.raised_by_name ? `raised by ${c.raised_by_name}` : null].filter(Boolean).join(" · ")}</p>
                    <div className="spread">
                      <Avatar name={c.student_name ?? c.raised_by_name ?? "?"} />
                      <span>{date(c.created_at)}</span>
                    </div>
                  </article>
                ))}
                {st === "open" ? (
                  <button type="button" className="kanban-add" onClick={add.show}>
                    + Add item
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
      {add.open && hostel ? (
        <Modal title="New complaint" onClose={close}>
          <form onSubmit={create}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Category" required>
                <input name="category" required list="complaint-categories" placeholder="e.g. Maintenance" />
                <datalist id="complaint-categories">
                  {["Maintenance", "Cleanliness", "Food", "Electrical", "Plumbing", "Security", "Other"].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <StudentPicker label="Student (optional)" value={student} onChange={setStudent} />
              <Field label="Description" required full>
                <textarea name="description" required />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Log complaint" />
          </form>
        </Modal>
      ) : null}
      {open ? (
        <Modal title={`#${open.id} · ${label(open.category)}`} onClose={close}>
          <form onSubmit={update}>
            <ErrorNote>{error}</ErrorNote>
            <p>{open.description}</p>
            <Kv rows={[["Student", open.student_name ?? "—"], ["Raised by", open.raised_by_name ?? "—"], ["Raised on", dateTime(open.created_at)], ["Resolved", dateTime(open.resolved_at)]]} />
            <div className="form-grid">
              <Field label="Status">
                <select name="status" defaultValue={open.status}>
                  {COLUMNS.map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Resolution" full>
                <textarea name="resolution" defaultValue={open.resolution ?? ""} />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Save" />
          </form>
        </Modal>
      ) : null}
      {billing ? (
        <Modal title="Raise monthly hostel fees" onClose={close}>
          <form onSubmit={bill}>
            <ErrorNote>{error}</ErrorNote>
            <p>Raises one fee per resident across all hostels, at their room or hostel rate. Residents already billed for the month are skipped.</p>
            <div className="form-grid">
              <Field label="Fee head" required>
                <select name="fee_head_id" required defaultValue={heads.data?.find((h) => /hostel|board/i.test(`${h.name} ${h.code}`))?.id ?? ""}>
                  <option value="">Select fee head</option>
                  {heads.data?.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Month" required>
                <input type="month" name="period" required defaultValue={today().slice(0, 7)} />
              </Field>
              <Field label="Due on day">
                <input type="number" name="due_day" min={1} max={28} defaultValue={10} />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Raise fees" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}
