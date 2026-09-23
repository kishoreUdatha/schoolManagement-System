"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { EmptyGuide, ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { Dialog, time12, usePageAction } from "./planKit";
import { ACTIVITY_KINDS, type Activity, type StaffRow, type StudentHit } from "./planTypes";

import { ask } from "@/lib/dialog";
const base = "/api/v1/school/academics/activities";
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function schedule(a: Activity) {
  const when = [a.day_of_week ? DAYS[a.day_of_week] : null, a.start_time ? `${time12(a.start_time)}${a.end_time ? `–${time12(a.end_time)}` : ""}` : null].filter(Boolean).join(" ");
  return [when, a.venue].filter(Boolean).join(" · ") || "No fixed time";
}

/** SCR-109, live: GET/POST /api/v1/school/academics/activities, GET/PATCH /activities/{id}, POST /members and /members/leave. */
export function Activities() {
  const canManage = useSession()?.user.role === "school_admin";
  const list = useApi<Activity[]>(base);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  usePageAction(
    "activities:create",
    useCallback(() => setCreating(true), []),
  );

  const q = search.trim().toLowerCase();
  const items = (list.data ?? []).filter(
    (a) =>
      (!kind || a.kind === kind) &&
      (!status || (status === "active" ? a.is_active && !a.is_full : status === "full" ? a.is_full : !a.is_active)) &&
      (!q || [a.name, a.in_charge_name ?? "", a.venue ?? ""].some((v) => v.toLowerCase().includes(q))),
  );
  const all = list.data ?? [];
  const live = all.filter((a) => a.is_active);
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Activities", value: n(all.length), note: `${live.length} active` },
    { label: "Members", value: n(live.reduce((s, a) => s + a.members, 0)), note: "across active activities" },
    { label: "Full", value: n(live.filter((a) => a.is_full).length), note: "no places left" },
    { label: "No coordinator", value: n(live.filter((a) => !a.in_charge_name).length), note: "need a teacher in charge" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search co-curricular activities…" aria-label="Search activities" />
        </div>
        <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {ACTIVITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Open for members</option>
          <option value="full">Full</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {items.length === 0 ? (
        <section className="panel">
          {list.loading || list.data?.length ? (
            <div className="panel-pad muted">{list.loading ? "Loading activities…" : "No activities match these filters."}</div>
          ) : (
            <div className="panel-pad">
              <EmptyGuide
                title="No clubs or teams yet"
                note="A club or team is anything children sign up for outside lessons; members and attendance are kept against it."
                action={
                  canManage ? (
                    <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                      Create activity
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}
        </section>
      ) : null}
      <div className="resource-grid">
        {items.map((a, i) => (
          <article className="resource-tile" key={a.id}>
            <div className={`file-icon ${i % 2 ? "xls" : "pdf"}`}>{a.kind.slice(0, 5).toUpperCase()}</div>
            <h3>{a.name}</h3>
            <p>
              {a.in_charge_name ? `${a.in_charge_name} · Coordinator` : "No coordinator yet"}
              <br />
              {`${schedule(a)} · ${a.members}${a.capacity ? ` / ${a.capacity}` : ""} members`}
            </p>
            <div className="spread">
              <Badge>{!a.is_active ? "Inactive" : a.is_full ? "Full" : "Active"}</Badge>
              <button type="button" className="btn" onClick={() => setOpenId(a.id)}>
                View activity
              </button>
            </div>
          </article>
        ))}
      </div>
      <ActivityForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          list.reload();
        }}
      />
      <Roster id={openId} canManage={canManage} onClose={() => setOpenId(null)} onChanged={list.reload} />
    </>
  );
}

function ActivityForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const staff = useApi<StaffRow[]>(open ? "/api/v1/school/staff" : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      await api.post(base, {
        name: text("name"),
        kind: text("kind") ?? "club",
        description: text("description"),
        // The coordinator is a user id (the staff row's user_id).
        in_charge_user_id: text("in_charge_user_id") ? Number(text("in_charge_user_id")) : null,
        day_of_week: text("day_of_week") ? Number(text("day_of_week")) : null,
        start_time: text("start_time"),
        end_time: text("end_time"),
        venue: text("venue"),
        capacity: text("capacity") ? Number(text("capacity")) : null,
      });
      notify("Activity created.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Create activity" open={open} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorNote>{error ?? staff.error}</ErrorNote>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="field">
              <span>
                Name<span className="req">*</span>
              </span>
              <input name="name" required minLength={2} placeholder="e.g. Science club" />
            </label>
            <label className="field">
              <span>Kind</span>
              <select name="kind" defaultValue="club">
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Coordinator</span>
              <select name="in_charge_user_id" defaultValue="">
                <option value="">{staff.loading ? "Loading staff…" : "Not yet"}</option>
                {staff.data
                  ?.filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Day</span>
              <select name="day_of_week" defaultValue="">
                <option value="">No fixed day</option>
                {DAYS.slice(1).map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Starts</span>
              <input type="time" name="start_time" />
            </label>
            <label className="field">
              <span>Ends</span>
              <input type="time" name="end_time" />
            </label>
            <label className="field">
              <span>Venue</span>
              <input name="venue" placeholder="e.g. Science lab" />
            </label>
            <label className="field">
              <span>Places</span>
              <input type="number" name="capacity" min={1} max={2000} placeholder="No limit" />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea name="description" />
            </label>
          </div>
        </fieldset>
        <div className="actions row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="plus" className="sm" />
            {busy ? "Creating…" : "Create activity"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Roster({ id, canManage, onClose, onChanged }: { id: number | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const detail = useApi<Activity>(id ? `${base}/${id}` : null);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => {
    setTyped("");
    setError(null);
  }, [id]);

  const hits = useApi<Paginated<StudentHit>>(canManage && id && search.length >= 2 ? "/api/v1/school/students" : null, { search, page_size: 6, status: "active" });
  const a = detail.data && detail.data.id === id ? detail.data : null;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      detail.reload();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const current = a?.roster?.filter((r) => r.is_current) ?? [];
  const past = a?.roster?.filter((r) => !r.is_current) ?? [];

  return (
    <Dialog title={a?.name ?? "Activity"} open={id !== null} onClose={onClose} wide>
      <ErrorNote>{error ?? detail.error}</ErrorNote>
      {!a ? (
        <p>Loading…</p>
      ) : (
        <>
          <dl className="kv">
            <div>
              <dt>Coordinator</dt>
              <dd>{a.in_charge_name ?? "—"}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>{schedule(a)}</dd>
            </div>
            <div>
              <dt>Members</dt>
              <dd>{`${a.members}${a.capacity ? ` of ${a.capacity}` : ""}${a.places_left !== null ? ` · ${a.places_left} places left` : ""}`}</dd>
            </div>
          </dl>
          {a.description ? <p style={{ marginTop: 10 }}>{a.description}</p> : null}
          <h3 style={{ margin: "16px 0 8px" }}>{`Current members (${current.length})`}</h3>
          {current.length ? (
            current.map((r) => (
              <div className="spread" key={r.member_id} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <div className="person">
                  <div>
                    {r.student_name}
                    <small>{`${r.admission_no} · joined ${date(r.joined_on)}${r.role ? ` · ${r.role}` : ""}`}</small>
                  </div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={async () => (await ask(`Take ${r.student_name} out of ${a.name}? The record of them stays.`)) && run(() => api.post(`${base}/${a.id}/members/leave`, { student_id: r.student_id }), `${r.student_name} left ${a.name}.`)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="muted">No members yet.</p>
          )}
          {past.length ? <p className="small muted" style={{ marginTop: 8 }}>{`${past.length} former member${past.length > 1 ? "s" : ""} on record.`}</p> : null}
          {canManage && a.is_active ? (
            <div style={{ marginTop: 16 }}>
              <div className="form-grid">
                <label className="field">
                  <span>Add a student</span>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Name or admission no." disabled={a.is_full} />
                </label>
                <label className="field">
                  <span>Role</span>
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Captain (optional)" />
                </label>
              </div>
              {a.is_full ? <p className="small muted">This activity is full.</p> : null}
              {(hits.data?.items ?? []).map((s) => (
                <div className="spread" key={s.id} style={{ padding: "6px 0" }}>
                  <span>{`${s.full_name} · ${s.admission_no}`}</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || a.is_full}
                    onClick={() =>
                      run(() => api.post(`${base}/${a.id}/members`, { student_id: s.id, role: role.trim() || null }), `${s.full_name} joined ${a.name}.`).then(() => {
                        setTyped("");
                        setRole("");
                      })
                    }
                  >
                    <Icon name="plus" className="sm" />
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="actions row" style={{ gap: 8, justifyContent: "flex-end" }}>
            {canManage ? (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.patch(`${base}/${a.id}`, { is_active: !a.is_active }), a.is_active ? "Activity closed." : "Activity reopened.")}>
                {a.is_active ? "Close activity" : "Reopen activity"}
              </button>
            ) : null}
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
