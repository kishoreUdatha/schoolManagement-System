"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import type { AcademicYear } from "@/features/students/types";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, Field, isoToday, StudentPicker } from "./common";
import type { Assignment, FeeHead, PickedStudent } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-157, live: GET /school/finance/assignments (what one child pays when it
 * differs from their class). "Assign fees" POSTs one; a row can be applied to
 * unpaid charges (POST …/apply) or ended (PATCH is_active=false).
 */
export function FeeAssignments() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads", { active_only: true });
  const [yearId, setYearId] = useState<number | null>(null);
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  const list = useApi<Assignment[]>(yearId ? "/api/v1/school/finance/assignments" : null, { academic_year_id: yearId, active_only: status === "active" });
  const items = (list.data ?? []).filter((a) => {
    const term = q.trim().toLowerCase();
    if (status === "ended" && a.is_active) return false;
    return !term || `${a.student_name ?? ""} ${a.admission_no ?? ""} ${a.fee_head_name ?? ""}`.toLowerCase().includes(term);
  });

  // Counted over what the server returned for the year and the status filter.
  const all = list.data ?? [];
  const year = years.data?.find((y) => y.id === yearId);
  const n = (v: number) => (list.data ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Assignments", value: n(all.length), note: status === "active" ? `Active in ${year?.name ?? "the year"}` : `In ${year?.name ?? "the year"}` },
    { label: "Students", value: n(new Set(all.map((a) => a.student_id)).size), note: "Pay differently from their class" },
    { label: "Below class", value: n(all.filter((a) => a.class_amount !== null && Number(a.amount) < Number(a.class_amount)).length), note: "Pay less than the class amount" },
    { label: "Extra heads", value: n(all.filter((a) => a.is_extra).length), note: "Not on the class structure" },
  ];

  const rows: Row[] = items.map((a) => [
    { name: a.student_name ?? `Student #${a.student_id}`, sub: a.admission_no ?? undefined },
    a.academic_year_name ?? "—",
    `${a.fee_head_name ?? "—"}${a.is_extra ? " · extra head" : ""}`,
    a.class_amount === null ? "—" : money(a.class_amount),
    money(a.amount),
    a.is_active ? "Active" : "Ended",
  ]);

  async function apply(a: Assignment) {
    if (!(await ask("Change this student's unpaid charges to the assigned amount? Paid and part-paid charges are left alone."))) return;
    setError(null);
    try {
      const r = await api.post<{ updated: number; left_alone_count: number }>(`/api/v1/school/finance/assignments/${a.id}/apply`);
      notify(`${r.updated} unpaid charge(s) updated for ${a.student_name ?? "the student"}.${r.left_alone_count ? ` ${r.left_alone_count} already had money against them and were left alone.` : ""}`);
      setOpen(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function end(a: Assignment) {
    if (!(await ask(`End this assignment for ${a.student_name ?? "the student"}? Future charges go back to the class amount.`))) return;
    setError(null);
    try {
      await api.patch(`/api/v1/school/finance/assignments/${a.id}`, { is_active: false, ends_on: isoToday() });
      notify("Assignment ended.");
      setOpen(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={years.data?.length === 0 ? stats.map((x) => ({ ...x, value: "—" })) : stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student fee assignment…" aria-label="Search records" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="all">All statuses</option>
          <option value="ended">Ended</option>
        </select>
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="sm" />
          Assign fees
        </button>
      </div>
      <ErrorNote>{error ?? years.error ?? list.error}</ErrorNote>
      <Panel title="Allocation workspace" sub="What a student pays when it differs from their class" flush>
        <DataTable
          columns={["Student", "Academic year", "Fee head", "Class amount", "Assigned amount", "Status"]}
          rows={rows}
          onView={(i) => setOpen(items[i])}
          empty={list.loading ? "Loading assignments…" : "No student-specific fee assignments. Everyone pays their class's structure."}
        />
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>An assignment names what the charge is; concessions still subtract from it. Apply one to update unpaid charges already raised.</span>
      </div>
      {open ? (
        <Dialog title={`${open.student_name ?? "Student"} · ${open.fee_head_name ?? "Fee"}`} onClose={() => setOpen(null)}>
          <dl className="kv">
            <div>
              <dt>Assigned amount</dt>
              <dd>{money(open.amount)}</dd>
            </div>
            <div>
              <dt>Class amount</dt>
              <dd>{open.class_amount === null ? "Not on the class structure" : money(open.class_amount)}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{`${date(open.starts_on)} → ${open.ends_on ? date(open.ends_on) : "open"}${open.period ? ` · ${open.period}` : ""}`}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{open.reason}</dd>
            </div>
            <div>
              <dt>Approved by</dt>
              <dd>{open.approved_by ?? "—"}</dd>
            </div>
          </dl>
          <div className="row actions">
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              Close
            </button>
            {open.is_active ? (
              <>
                <button type="button" className="btn" onClick={() => end(open)}>
                  End assignment
                </button>
                <button type="button" className="btn primary" onClick={() => apply(open)}>
                  <Icon name="check" className="sm" />
                  Apply to unpaid charges
                </button>
              </>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      {adding ? (
        <NewAssignment
          years={years.data ?? []}
          heads={heads.data ?? []}
          yearId={yearId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function NewAssignment({ years, heads, yearId, onClose, onSaved }: { years: AcademicYear[]; heads: FeeHead[]; yearId: number | null; onClose: () => void; onSaved: () => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [f, setF] = useState({ fee_head_id: "", academic_year_id: yearId ? String(yearId) : "", amount: "", reason: "", starts_on: isoToday(), ends_on: "", due_day_of_month: "10" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student) {
      setError("Choose the student.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/finance/assignments", {
        student_id: student.id,
        fee_head_id: Number(f.fee_head_id),
        academic_year_id: Number(f.academic_year_id),
        amount: f.amount,
        reason: f.reason.trim(),
        starts_on: f.starts_on,
        ends_on: f.ends_on || null,
        due_day_of_month: Number(f.due_day_of_month) || 10,
      });
      notify("Fee assigned. Apply it to update unpaid charges already raised.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="Assign a fee to a student" onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <StudentPicker value={student} onChange={setStudent} />
          <Field label="Fee head" required>
            <select value={f.fee_head_id} onChange={set("fee_head_id")} required>
              <option value="">Select fee head</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year" required>
            <select value={f.academic_year_id} onChange={set("academic_year_id")} required>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount per charge (₹)" required>
            <input type="number" min={0} step="0.01" value={f.amount} onChange={set("amount")} required />
          </Field>
          <Field label="Starts on" required>
            <input type="date" value={f.starts_on} onChange={set("starts_on")} required />
          </Field>
          <Field label="Ends on">
            <input type="date" value={f.ends_on} onChange={set("ends_on")} />
          </Field>
          <Field label="Due day of month">
            <input type="number" min={1} max={31} value={f.due_day_of_month} onChange={set("due_day_of_month")} />
          </Field>
          <Field label="Reason" required full>
            <textarea value={f.reason} onChange={set("reason")} minLength={3} maxLength={2000} required placeholder="Why this student pays a different amount" />
          </Field>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Assign fee"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
