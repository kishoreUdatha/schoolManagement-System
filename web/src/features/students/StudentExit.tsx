"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { today } from "./StudentFrame";
import type { Leaver, Loan } from "./records";
import type { AcademicYear, Student, StudentProfile } from "./types";

/**
 * SCR-070, live: POST /students/{id}/transfer {to_school, left_on, reason,
 * remarks, ignore_dues}. Clearance is read from /students/{id} (fees pending) and
 * /library/loans (books still out); leavers from /student-detail/leavers.
 */
export function StudentExit() {
  const router = useRouter();
  const preset = useSearchParams().get("id");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const current = years.data?.find((y) => y.is_current) ?? years.data?.[0];
  const students = useApi<Paginated<Student>>(current ? "/api/v1/school/students" : null, { academic_year_id: current?.id, status: "active", page_size: 200 });
  const leavers = useApi<{ leavers: Leaver[]; total: number; without_certificate: number }>("/api/v1/school/student-detail/leavers");
  const [studentId, setStudentId] = useState<string>(preset ?? "");
  const [ignoreDues, setIgnoreDues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preset) setStudentId(preset);
  }, [preset]);

  const profile = useApi<StudentProfile>(studentId ? `/api/v1/school/students/${studentId}` : null);
  const loans = useApi<Loan[]>(studentId ? "/api/v1/school/library/loans" : null, { student_id: studentId, open_only: true });
  const p = profile.data;
  const owed = Number(p?.fees_pending_amount ?? 0);
  const out = loans.data?.length ?? 0;
  const options = students.data?.items ?? [];
  const presetMissing = p && !options.some((s) => String(s.id) === studentId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId) return setError("Choose the student who is leaving.");
    const f = new FormData(e.currentTarget);
    const reason = String(f.get("reason") ?? "").trim();
    if (!window.confirm(`Record that ${p?.full_name ?? "this student"} has left? They become inactive and leave the class lists; this cannot be undone here.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ student_name: string; note: string }>(`/api/v1/school/students/${studentId}/transfer`, {
        to_school: String(f.get("to_school") ?? "").trim(),
        left_on: String(f.get("left_on")) || null,
        reason: reason || null,
        remarks: String(f.get("remarks") ?? "").trim() || null,
        ignore_dues: ignoreDues,
      });
      notify(res.note || `${res.student_name} has left the school.`);
      leavers.reload();
      router.push(`${routeOf(57)}?id=${studentId}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (t: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {t}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div className="two-col">
      <form id="exit-form" className="panel" onSubmit={submit}>
        <div className="steps">
          {["Basic details", "Clearance", "Certificate", "Review"].map((t, i) => (
            <div key={t} className={`step ${i === 0 ? "active" : ""}`}>
              <b>{i + 1}</b>
              {t}
            </div>
          ))}
        </div>
        <div className="panel-pad">
          <ErrorNote>{error ?? years.error ?? students.error ?? profile.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field(
                  "Student",
                  <select value={studentId} required onChange={(e) => (setStudentId(e.target.value), setIgnoreDues(false))}>
                    <option value="">{students.loading ? "Loading students…" : "Select student"}</option>
                    {presetMissing ? <option value={studentId}>{`${p.full_name} · ${p.admission_no}`}</option> : null}
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>
                        {`${s.full_name} · ${s.admission_no}`}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field("Exit date", <input type="date" name="left_on" required defaultValue={today()} max={today()} />, true)}
                {field("Exit reason", <input name="reason" required maxLength={300} placeholder="Enter exit reason" defaultValue="Transfer to another school" />, true)}
                {field("Destination school", <input name="to_school" required minLength={2} maxLength={200} placeholder="School the student is joining" />, true)}
                {field("Library clearance", <input readOnly value={!studentId ? "—" : loans.loading ? "Checking…" : out ? `${out} book${out === 1 ? "" : "s"} still on loan` : "Cleared"} />)}
                {field("Fee clearance", <input readOnly value={!p ? "—" : owed > 0 ? `${money(owed)} outstanding` : "No outstanding balance"} />)}
                {field("Transfer certificate", <input readOnly value="Issue from Certificates once the student has left" />)}
                {owed > 0
                  ? field(
                      "Outstanding fees",
                      <span className="row">
                        <input type="checkbox" checked={ignoreDues} onChange={(e) => setIgnoreDues(e.target.checked)} />
                        {`Record the exit although ${money(owed)} is still owed`}
                      </span>,
                      false,
                      true,
                    )
                  : null}
                {field("Remarks", <textarea name="remarks" maxLength={4000} rows={3} placeholder="Anything to keep on the record about this exit" />, false, true)}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || (owed > 0 && !ignoreDues)}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : "Record exit"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <Panel title="Recent leavers" sub={leavers.data ? `${leavers.data.total} left · ${leavers.data.without_certificate} without a certificate` : "Loading…"}>
          {(leavers.data?.leavers ?? []).slice(0, 6).map((l) => (
            <div className="spread" key={l.student_id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div>
                <Link href={`${routeOf(57)}?id=${l.student_id}`}>{l.full_name}</Link>
                <p className="small muted">{`${l.admission_no} · ${l.last_class_name ?? ""} ${l.last_section_name ?? ""} · ${l.last_year_name ?? "—"}${l.left_on ? ` · left ${date(l.left_on)}` : ""}`}</p>
                {l.exit_remarks ? <p className="small muted">{l.exit_remarks}</p> : null}
              </div>
              <Badge>{l.certificate_no ? `TC ${l.certificate_no}` : "No certificate"}</Badge>
            </div>
          ))}
          {leavers.data && !leavers.data.leavers.length ? <p className="muted">No student has left yet.</p> : null}
          <div className="gap" />
          <Link href="/documents/transfer-certificate" className="btn">
            Issue transfer certificate
          </Link>
          <p className="small muted">{`As of ${date(today())}`}</p>
        </Panel>
      </aside>
    </div>
  );
}
