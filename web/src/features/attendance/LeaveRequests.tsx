"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Modal, usePageAction, useSchoolDay } from "./shared";
import { EV, LEAVE_KINDS, type Child, type StudentLeave } from "./types";

/**
 * SCR-114, live: a parent asks for leave for their child and follows it.
 * GET /parent/me/children, GET + POST /parent/me/children/{id}/leaves,
 * POST …/leaves/{leave_id}/cancel. The class teacher is notified on apply.
 */
export function LeaveRequests() {
  const children = useApi<Child[]>("/api/v1/parent/me/children");
  const [childId, setChildId] = useState("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [leaves, setLeaves] = useState<StudentLeave[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Every child's requests, together, unless one child is chosen.
  useEffect(() => {
    const kids = children.data;
    if (!kids) return;
    const ids = childId ? [Number(childId)] : kids.map((k) => k.id);
    let live = true;
    Promise.all(ids.map((id) => api.get<StudentLeave[]>(`/api/v1/parent/me/children/${id}/leaves`)))
      .then((all) => {
        if (!live) return;
        setLeaves(all.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)));
        setError(null);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [children.data, childId, tick]);

  const q = typed.trim().toLowerCase();
  const items = useMemo(
    () => (leaves ?? []).filter((l) => (!status || l.status === status) && (!q || `${l.student_name} ${l.kind} ${l.reason}`.toLowerCase().includes(q))),
    [leaves, status, q],
  );
  const rows: Row[] = items.map((l) => [{ name: l.student_name, sub: l.section_label }, `${label(l.kind)} leave`, date(l.from_date), date(l.to_date), String(l.days), label(l.status)]);

  // Viewing one request, and cancelling it while it is pending, or approved
  // but not yet started (the same rule as the backend and the parent app).
  const [viewing, setViewing] = useState<StudentLeave | null>(null);
  const [busy, setBusy] = useState(false);
  async function cancel(l: StudentLeave) {
    if (!window.confirm(`Cancel ${l.student_name}'s leave request?`)) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/parent/me/children/${l.student_id}/leaves/${l.id}/cancel`);
      notify("Request cancelled.");
      setViewing(null);
      setTick((t) => t + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Applying
  const today = useSchoolDay();
  const [open, setOpen] = useState(false);
  const blank = { child: "", kind: "sick", from_date: "", to_date: "", reason: "" };
  const [f, setF] = useState(blank);
  const [formError, setFormError] = useState<string | null>(null);
  usePageAction(EV.requestLeave, () => {
    setF({ ...blank, child: childId || String(children.data?.[0]?.id ?? ""), from_date: today ?? "", to_date: today ?? "" });
    setFormError(null);
    setOpen(true);
  });
  async function apply() {
    if (!f.child || !f.from_date || !f.to_date) return setFormError("Choose the child and the dates.");
    if (f.to_date < f.from_date) return setFormError("The last day is before the first.");
    setBusy(true);
    setFormError(null);
    try {
      await api.post(`/api/v1/parent/me/children/${f.child}/leaves`, { kind: f.kind, from_date: f.from_date, to_date: f.to_date, reason: f.reason.trim() });
      notify("Leave requested. The class teacher has been told.");
      setOpen(false);
      setTick((t) => t + 1);
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  usePageAction(EV.exportLeaves, () => {
    const head = ["Student", "Class", "Leave type", "From", "To", "Days", "Status", "Reason"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [head, ...items.map((l) => [l.student_name, l.section_label, l.kind, l.from_date, l.to_date, String(l.days), l.status, l.reason])].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "leave-requests.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search student leave requests…" aria-label="Search records" />
        </div>
        <select aria-label="Child" value={childId} onChange={(e) => setChildId(e.target.value)}>
          <option value="">All children</option>
          {children.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <ErrorNote>{error ?? children.error}</ErrorNote>
      <Panel title="All records" sub={`Leave requests for ${childId ? (children.data?.find((c) => String(c.id) === childId)?.full_name ?? "your child") : "your children"}${leaves === null ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Leave type", "From", "To", "Days", "Status"]}
          rows={rows}
          selectable={false}
          onView={(i) => setViewing(items[i])}
          empty={leaves === null ? "Loading requests…" : leaves.length ? "No requests match these filters." : "No leave has been requested yet."}
        />
      </Panel>
      <Modal
        open={Boolean(viewing)}
        title={viewing ? `${viewing.student_name} · ${label(viewing.kind)} leave` : ""}
        onClose={() => setViewing(null)}
        footer={
          viewing && (viewing.status === "pending" || (viewing.status === "approved" && today !== null && viewing.from_date > today)) ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => cancel(viewing)}>
              Cancel request
            </button>
          ) : null
        }
      >
        {viewing ? (
          <dl className="kv" style={{ gridColumn: "1 / -1" }}>
            {[
              ["Dates", `${date(viewing.from_date)} – ${date(viewing.to_date)} (${viewing.days} ${viewing.days === 1 ? "day" : "days"})`],
              ["Reason", viewing.reason],
              ["Status", label(viewing.status)],
              ["Decided by", viewing.decided_by_name ?? "—"],
              ["Note from school", viewing.decision_note ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>
      <Modal
        open={open}
        title="Request leave"
        onClose={() => setOpen(false)}
        footer={
          <button type="button" className="btn primary" disabled={busy || f.reason.trim().length < 3} onClick={apply}>
            <Icon name="check" className="sm" />
            {busy ? "Sending…" : "Request leave"}
          </button>
        }
      >
        {formError ? <div style={{ gridColumn: "1 / -1" }}><ErrorNote>{formError}</ErrorNote></div> : null}
        <label className="field">
          <span>
            Child<span className="req">*</span>
          </span>
          <select value={f.child} onChange={(e) => setF({ ...f, child: e.target.value })}>
            {children.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Leave type</span>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {LEAVE_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            From<span className="req">*</span>
          </span>
          <input type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: f.to_date < e.target.value ? e.target.value : f.to_date })} />
        </label>
        <label className="field">
          <span>
            To<span className="req">*</span>
          </span>
          <input type="date" value={f.to_date} min={f.from_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
        </label>
        <label className="field full">
          <span>
            Reason<span className="req">*</span>
          </span>
          <textarea value={f.reason} minLength={3} maxLength={2000} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Tell the class teacher why" />
        </label>
      </Modal>
    </>
  );
}
