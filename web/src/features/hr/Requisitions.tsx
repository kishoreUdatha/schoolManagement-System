"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import type { Department, Requisition, RequisitionStatus } from "./types";
import { AVATAR_TONES, Dialog, Field, useNewFlag } from "./ui";

import { ask } from "@/lib/dialog";
const BASE = "/api/v1/school/hr-ops/requisitions";
const STATES: RequisitionStatus[] = ["draft", "submitted", "approved", "rejected", "filled", "cancelled"];
const SHOWN: Record<RequisitionStatus, string> = {
  draft: "Draft",
  submitted: "Pending decision",
  approved: "Approved",
  rejected: "Declined",
  filled: "Filled",
  cancelled: "Cancelled",
};

/** Whole days between an ISO timestamp and now. */
const ageDays = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * SCR-172, live: GET/POST /api/v1/school/hr-ops/requisitions, then
 * /{id}/submit, /{id}/decide and /{id}/status. The server refuses a decision
 * by whoever raised the request; its message is shown as it comes.
 */
export function Requisitions() {
  const [state, setState] = useState("");
  const [deptId, setDeptId] = useState("");
  const [typed, setTyped] = useState("");
  const list = useApi<Requisition[]>(BASE, { state });
  const all = useApi<Requisition[]>(BASE);
  // Anyone who can open this screen (school admin, principal, or a person
  // with the HR job) can fill and cancel requests; nobody reviews their own.
  const me = useSession()?.user;
  const depts = useApi<Department[]>("/api/v1/school/departments");
  const [creating, closeCreate] = useNewFlag();
  const [deciding, setDeciding] = useState<Requisition | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    list.reload();
    all.reload();
  };

  const rows = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter(
      (r) =>
        (!deptId || String(r.department_id) === deptId) &&
        (!q || [r.title, r.reason, r.department_name, r.raised_by].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [list.data, deptId, typed]);

  useEffect(() => {
    if (rows.length && !rows.some((r) => r.id === selected)) setSelected(rows[0].id);
  }, [rows, selected]);

  // Figures over every request (the list is not paged), whatever the filter.
  const everything = all.data ?? [];
  const waiting = everything.filter((r) => r.status === "submitted");
  const oldest = waiting.reduce<Requisition | null>((o, r) => (!o || r.created_at < o.created_at ? r : o), null);
  const approved = everything.filter((r) => r.status === "approved");
  const n = (v: number) => (all.data ? String(v) : "…");
  const stats = [
    { label: "Awaiting decision", value: n(waiting.length), note: "Sent for approval" },
    { label: "Approved", value: n(approved.length), note: `${approved.reduce((t, r) => t + r.headcount, 0)} posts agreed, not yet filled` },
    { label: "Declined", value: n(everything.filter((r) => r.status === "rejected").length), note: "Kept on record" },
    { label: "Oldest request", value: oldest ? `${ageDays(oldest.created_at)} days` : "—", note: oldest ? `Raised ${date(oldest.created_at)}` : "Nothing waiting" },
  ];

  async function act(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      notify(done);
      reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    const ok = await act(
      () =>
        api.post(BASE, {
          title: text("title"),
          department_id: text("department_id") ? Number(text("department_id")) : null,
          headcount: Number(text("headcount")) || 1,
          reason: text("reason"),
          role_description: text("role_description") || null,
          needed_by: text("needed_by") || null,
        }),
      "Request saved as a draft. Send it when you are ready for a decision.",
    );
    setBusy(false);
    if (ok) closeCreate();
  }

  async function decide(e: FormEvent<HTMLFormElement>) {
    if (!deciding) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await act(
      () => api.post(`${BASE}/${deciding.id}/decide`, { approve: f.get("approve") === "yes", note: String(f.get("note") ?? "").trim() || null }),
      "Decision recorded.",
    );
    setBusy(false);
    if (ok) setDeciding(null);
  }

  const current = rows.find((r) => r.id === selected) ?? null;
  const history = everything
    .filter((r) => r.decided_at)
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
    .slice(0, 5);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search recruitment requisitions…" aria-label="Search requisitions" />
        </div>
        <select aria-label="Filter by department" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {SHOWN[s]}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{state ? `${SHOWN[state as RequisitionStatus]} requests` : "Requests to hire"}</strong>
            <span>{list.loading ? "Loading…" : `${rows.length} shown`}</span>
          </div>
          {rows.length === 0 && !list.loading ? (
            <div className="panel-pad muted">{typed || deptId || state ? "No request matches these filters." : "Nobody has asked for a post yet."}</div>
          ) : null}
          {rows.map((r, i) => (
            <article className="request-card" key={r.id} onClick={() => setSelected(r.id)} style={r.id === selected ? { background: "var(--soft, #f5f9ff)" } : undefined}>
              <span className={`avatar ${AVATAR_TONES[i % 4]}`}>{initials(r.raised_by ?? r.title)}</span>
              <div className="request-info">
                <h3>{r.title}</h3>
                <p>{`Department: ${r.department_name ?? "—"} · Vacancies: ${r.headcount} · Requested by: ${r.raised_by ?? "—"}`}</p>
                <p>{`Submitted ${date(r.created_at)}${r.needed_by ? ` · Needed by ${date(r.needed_by)}` : ""}`}</p>
              </div>
              <div className="actions">
                <Badge>{SHOWN[r.status]}</Badge>
                {r.status === "draft" ? (
                  <button type="button" className="btn" onClick={() => act(() => api.post(`${BASE}/${r.id}/submit`), `${r.title} sent for a decision.`)}>
                    Send
                  </button>
                ) : null}
                {(r.status === "draft" || r.status === "submitted") && r.raised_by_user_id !== me?.id ? (
                  <button type="button" className="btn primary" onClick={() => setDeciding(r)}>
                    <Icon name="check" className="sm" />
                    Review
                  </button>
                ) : null}
                {r.status === "approved" ? (
                  <button type="button" className="btn" onClick={() => act(() => api.post(`${BASE}/${r.id}/status`, { status: "filled" }), `${r.title} marked filled.`)}>
                    Mark filled
                  </button>
                ) : null}
                {["draft", "submitted", "approved"].includes(r.status) ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => (await ask(`Cancel the request for ${r.title}?`)) && act(() => api.post(`${BASE}/${r.id}/status`, { status: "cancelled" }), "Request cancelled.")}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="stack">
          <Panel title="Review checklist" sub={current ? current.title : "Choose a request"}>
            {current ? (
              <div className="checklist">
                {(
                  [
                    ["Reason given", current.reason.length >= 3, current.reason],
                    ["Role described", Boolean(current.role_description), current.role_description ?? "Not described"],
                    ["Department named", Boolean(current.department_name), current.department_name ?? "No department"],
                    ["Needed-by date", Boolean(current.needed_by), current.needed_by ? date(current.needed_by) : "No date given"],
                  ] as [string, boolean, string][]
                ).map(([t, ok, sub]) => (
                  <div className="check-item" key={t}>
                    <input type="checkbox" aria-label={t} checked={ok} readOnly disabled />
                    <label>
                      {t}
                      <small>{sub.length > 90 ? `${sub.slice(0, 90)}…` : sub}</small>
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Nothing to review.</p>
            )}
          </Panel>
          <Panel title="Approval history">
            {history.length ? (
              history.map((r) => (
                <div className="timeline-item" key={r.id}>
                  <span className="timeline-dot">
                    <Icon name={r.status === "rejected" ? "bell" : "check"} />
                  </span>
                  <div>
                    <h4>{`${r.title} · ${SHOWN[r.status]}`}</h4>
                    <p>{[r.decided_by, r.decision_note].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <time>{dateTime(r.decided_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{all.loading ? "Loading…" : "No request has been decided yet."}</p>
            )}
          </Panel>
        </aside>
      </div>

      {creating ? (
        <Dialog title="Create requisition" onClose={closeCreate} onSubmit={create} submit="Save as draft" busy={busy} error={error}>
          <div className="form-grid">
            <Field label="Post" required>
              <input name="title" required maxLength={160} placeholder="Second maths teacher" />
            </Field>
            <Field label="Department">
              <select name="department_id" defaultValue="">
                <option value="">None</option>
                {depts.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vacancies" required>
              <input name="headcount" type="number" min={1} max={200} defaultValue={1} required />
            </Field>
            <Field label="Needed by">
              <input name="needed_by" type="date" />
            </Field>
            <Field label="Why the post is needed" required full>
              <textarea name="reason" required minLength={3} maxLength={8000} rows={3} />
            </Field>
            <Field label="What the role involves" full>
              <textarea name="role_description" maxLength={8000} rows={3} />
            </Field>
          </div>
        </Dialog>
      ) : null}

      {deciding ? (
        <Dialog title={`Decide: ${deciding.title}`} onClose={() => setDeciding(null)} onSubmit={decide} submit="Record the decision" busy={busy} error={error}>
          <p>{`${deciding.headcount} post(s)${deciding.department_name ? ` in ${deciding.department_name}` : ""}${deciding.needed_by ? `, needed by ${date(deciding.needed_by)}` : ""}.`}</p>
          <p>{deciding.reason}</p>
          {deciding.raised_by ? <p>{`Raised by ${deciding.raised_by}. A request cannot be decided by whoever raised it.`}</p> : null}
          <div className="form-grid">
            <Field label="Decision" required>
              <select name="approve" defaultValue="yes">
                <option value="yes">Approve</option>
                <option value="no">Decline</option>
              </select>
            </Field>
            <Field label="Note" full>
              <input name="note" maxLength={300} placeholder="Optional" />
            </Field>
          </div>
          <p className="small muted">{`Status now: ${label(deciding.status)}`}</p>
        </Dialog>
      ) : null}
    </>
  );
}
