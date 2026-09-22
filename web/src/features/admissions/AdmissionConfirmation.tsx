"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import { APPS, emitChange, seatText, todayIso, useSeats, useYears } from "./shared";
import type { Application } from "./types";

import { ask } from "@/lib/dialog";
type FeeStructure = { id: number; fee_head_name: string; amount: string; is_recurring?: boolean };

type AdmitResult = { student_id: number; admission_no: string; parent_temporary_password?: string | null; parent_login_note?: string | null };

/**
 * SCR-054, live: GET /applications/{id} (?id=, or pick from the approved
 * ones), POST /applications/{id}/fee when the fee is due, then
 * POST /applications/{id}/admit (with the admission date) to create the
 * student and parent login. Seats from GET /admissions/seats; the class fee
 * structure (GET /fees/structures?class_id=) is shown, since its one-time
 * fees are raised on admission.
 */
export function AdmissionConfirmation() {
  const router = useRouter();
  const idParam = useSearchParams().get("id");
  const ready = useApi<Application[]>(idParam ? null : APPS);
  const readyList = (ready.data ?? []).filter((a) => a.status === "approved" || a.status === "fee_pending");
  const id = idParam ?? (readyList[0] ? String(readyList[0].id) : null);
  const res = useApi<Application>(id ? `${APPS}/${id}` : null);
  const a = res.data;
  const years = useYears();
  const yearId = a?.academic_year_id ?? years.current?.id ?? null;
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const seats = useSeats(yearId);
  const [classId, setClassId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdmitResult | null>(null);

  useEffect(() => {
    if (a && classId === null) setClassId(a.class_id);
  }, [a, classId]);
  const sections = useMemo(() => classes.data?.find((c) => c.id === classId)?.sections ?? [], [classes.data, classId]);
  const structures = useApi<FeeStructure[]>(classId && yearId ? "/api/v1/school/fees/structures" : null, { academic_year_id: yearId, class_id: classId });

  if (!idParam && ready.loading && !ready.data) return <Loading what="Loading approved applications…" />;
  if (!id)
    return (
      <section className="panel">
        <div className="panel-pad">
          <p className="muted" style={{ marginBottom: 14 }}>No application is approved and waiting to become a student.</p>
          <Link href={routeOf(53)} className="btn primary">
            <Icon name="arrow" className="sm" />
            Open admission approval
          </Link>
        </div>
      </section>
    );
  if (res.loading && !a) return <Loading what="Loading the application…" />;
  if (!a) return <ErrorNote>{res.error ?? "Application not found."}</ErrorNote>;

  const feeOwed = a.status === "fee_pending" && !a.fee_paid_on;
  const canAdmit = (a.status === "approved" || (a.status === "fee_pending" && Boolean(a.fee_paid_on))) && !result;

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!a) return;
    const f = new FormData(ev.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setSaving(true);
    setError(null);
    try {
      if (feeOwed) {
        await api.post(`${APPS}/${a.id}/fee`, { amount: text("fee_amount"), paid_on: text("fee_date") ?? todayIso(), receipt_no: text("receipt_no") });
        notify("Fee recorded.");
        res.reload();
        return;
      }
      if (!sectionId || !yearId) {
        setError("Choose a class and section.");
        return;
      }
      if (!(await ask(`Create the student record for ${a.student_name ?? "this applicant"} and admit them?`))) return;
      const r = await api.post<AdmitResult>(`${APPS}/${a.id}/admit`, {
        academic_year_id: yearId,
        section_id: sectionId,
        admission_no: text("admission_no"),
        admission_date: text("admission_date"),
        create_parent_login: f.get("login") === "on",
        relation: text("relation") ?? "guardian",
      });
      setResult(r);
      notify(`Student created as ${r.admission_no}.`);
      emitChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (text: string, control: JSX.Element, required = false) => (
    <label className="field">
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );
  const seatsBySection = new Map((seats.data ?? []).flatMap((c) => c.sections.map((x) => [x.section_id, x] as const)));
  const chosen = sectionId ? seatsBySection.get(sectionId) : undefined;
  const classSeats = classId ? seats.data?.find((c) => c.class_id === classId) : undefined;
  const seatOk = chosen ? !chosen.capacity || (chosen.available ?? 0) > 0 : Boolean(classSeats && (!classSeats.capacity || (classSeats.available ?? 0) > 0));
  const seatSub = chosen ? `Section ${chosen.name}: ${seatText(chosen)}` : classSeats ? `${classSeats.class_name}: ${seatText(classSeats)}` : classId ? "…" : "Choose a class";
  const docsOk = a.documents_total > 0 && a.documents_verified === a.documents_total;
  const tests = (a.assessments ?? []).filter((t) => t.status !== "cancelled");
  const testsOk = tests.length > 0 && tests.every((t) => t.status === "done");
  const approved = ["approved", "fee_pending", "admitted"].includes(a.status);

  return (
    <div className="two-col">
      <form id="admit-form" className="panel" onSubmit={submit}>
        <div className="success-hero">
          <div className="success-icon">
            <Icon name="check" />
          </div>
          <h2>{result || a.status === "admitted" ? "Student created" : approved ? "Application approved" : `Application ${label(a.status).toLowerCase()}`}</h2>
          <p>
            {result
              ? `${a.student_name} is now a student, admission no. ${result.admission_no}.`
              : a.status === "admitted"
                ? `${a.student_name} has already been admitted.`
                : feeOwed
                  ? `Record the admission fee, then ${a.student_name} can become a student.`
                  : approved
                    ? `${a.student_name} is ready to become a student.`
                    : "Only approved applications can become students."}
          </p>
        </div>
        <div className="panel-body">
          <ErrorNote>{error}</ErrorNote>
          {result ? (
            <div className="tip" role="status" style={{ marginBottom: 16 }}>
              <Icon name="check" className="sm" />
              <span>
                {[
                  result.parent_temporary_password ? `Parent login: ${a.email ?? a.phone} · temporary password ${result.parent_temporary_password}` : null,
                  result.parent_login_note,
                ]
                  .filter(Boolean)
                  .join(" ") || "No parent login was created."}
              </span>
            </div>
          ) : null}
          <div className="form-grid">
            {!idParam && readyList.length > 1
              ? field(
                  "Application",
                  <select value={a.id} onChange={(e) => router.replace(`${routeOf(54)}?id=${e.target.value}`)}>
                    {readyList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {`${r.student_name} · ${r.application_no}`}
                      </option>
                    ))}
                  </select>,
                )
              : field("Application number", <input type="text" value={a.application_no} readOnly />, true)}
            {field("Student name", <input type="text" value={a.student_name} readOnly />, true)}
            {feeOwed ? (
              <>
                {field("Fee amount", <input type="number" name="fee_amount" min={0} step="0.01" required placeholder="e.g. 5000" />, true)}
                {field("Paid on", <input type="date" name="fee_date" defaultValue={todayIso()} required />, true)}
                {field("Receipt no.", <input type="text" name="receipt_no" placeholder="Optional" />)}
              </>
            ) : (
              <>
                {field(
                  "Class",
                  <select
                    required
                    value={classId ?? ""}
                    disabled={!canAdmit}
                    onChange={(e) => {
                      setClassId(e.target.value ? Number(e.target.value) : null);
                      setSectionId(null);
                    }}
                  >
                    <option value="">{classes.loading ? "Loading classes…" : "Select class"}</option>
                    {classes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field(
                  "Section",
                  <select required value={sectionId ?? ""} disabled={!classId || !canAdmit} onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Select section</option>
                    {sections.map((s) => {
                      const x = seatsBySection.get(s.id);
                      return (
                        <option key={s.id} value={s.id}>
                          {`${s.name} · ${x ? seatText(x) : `capacity ${s.capacity}`}`}
                        </option>
                      );
                    })}
                  </select>,
                  true,
                )}
                {field("Admission date", <input type="date" name="admission_date" defaultValue={todayIso()} disabled={!canAdmit} required />, true)}
                {field(
                  "Fee structure",
                  <input
                    type="text"
                    readOnly
                    value={
                      !classId
                        ? "Choose a class"
                        : structures.loading && !structures.data
                          ? "Loading…"
                          : structures.data?.length
                            ? structures.data.map((x) => `${x.fee_head_name} ${money(x.amount)}${x.is_recurring ? " a month" : " once"}`).join(" · ")
                            : "No fee structure for this class"
                    }
                    title="The class's fee structure applies; its one-time fees are raised when the student is created."
                  />,
                )}
                {field("Admission no.", <input type="text" name="admission_no" placeholder="Leave blank to number automatically" disabled={!canAdmit} />)}
                {field(
                  "Parent is the",
                  <select name="relation" defaultValue="guardian" disabled={!canAdmit}>
                    {["father", "mother", "guardian", "other"].map((r) => (
                      <option key={r} value={r}>
                        {label(r)}
                      </option>
                    ))}
                  </select>,
                )}
                <label className="field">
                  <span>Parent login</span>
                  <span className="row">
                    <input type="checkbox" name="login" defaultChecked disabled={!canAdmit} /> Create a parent portal login
                  </span>
                </label>
              </>
            )}
          </div>
        </div>
        <div className="form-footer">
          {result ? (
            <Link href={`${routeOf(57)}?id=${result.student_id}`} className="btn primary">
              <Icon name="arrow" className="sm" />
              Open the student
            </Link>
          ) : (
            <button type="submit" className="btn primary" disabled={saving || (!feeOwed && !canAdmit)}>
              <Icon name={feeOwed ? "money" : "check"} className="sm" />
              {saving ? "Saving…" : feeOwed ? "Record fee" : "Create student"}
            </button>
          )}
        </div>
      </form>
      <aside>
        <Panel title="Completed checks">
          <div className="checklist">
            {[
              ["Documents verified", docsOk, `${a.documents_verified} of ${a.documents_total}`],
              ["Assessment completed", testsOk, tests.length ? `${tests.filter((t) => t.status === "done").length} of ${tests.length} marked` : "None scheduled"],
              ["Admission approved", approved, a.decided_at ? `By ${a.decided_by_name ?? "the school"}` : "Pending"],
              ["Admission fee", !feeOwed, a.fee_paid_on ? `${money(a.application_fee)} paid` : feeOwed ? "Due" : "Not required"],
              ["Class seat available", seatOk, seatSub],
            ].map(([t, ok, sub]) => (
              <div className="check-item" key={String(t)}>
                {ok ? <Icon name="check" /> : <Icon name="clock" />}
                <label>
                  {t}
                  <small>{sub}</small>
                </label>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
