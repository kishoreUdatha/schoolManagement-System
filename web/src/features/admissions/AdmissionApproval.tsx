"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { appClass, APPS, daysFromToday, emitChange, seatText, useDetails, useOnAction, useOnChange, useSeats, useYears } from "./shared";
import type { Application, OnlyApplication } from "./types";

import { ask } from "@/lib/dialog";
const AWAITING = ["submitted", "verification", "assessment"];
const TONES = ["mint", "", "peach", "lilac"];

function assessmentSummary(a: Application | undefined): string {
  const tests = (a?.assessments ?? []).filter((t) => t.status !== "cancelled");
  if (!a) return "…";
  if (!tests.length) return "None scheduled";
  return tests
    .map((t) => `${label(t.kind)} ${t.status === "done" ? (t.max_marks ? `${Number(t.marks_obtained ?? 0)}/${Number(t.max_marks)}` : t.passed ? "passed" : "not passed") : label(t.status).toLowerCase()}`)
    .join(" + ");
}

/**
 * SCR-053, live: applications waiting for a decision (GET /applications,
 * submitted · verification · assessment, with GET /applications/{id} for the
 * evidence). POST /applications/{id}/decide approves or rejects. Class
 * capacity from GET /admissions/seats for the application's year.
 *
 * With `only` it is the Approval tab of SCR-050: the figures, the search and
 * the queue of other requests go, leaving this application's checklist,
 * decision and history.
 */
export function AdmissionApproval({ only }: { only?: OnlyApplication }) {
  const idParam = useSearchParams().get("id");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<number | null>(idParam ? Number(idParam) : null);
  const [note, setNote] = useState("");
  const [feeDue, setFeeDue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  // Narrowed to one application there is no queue to fetch, only its detail.
  const list = useApi<Application[]>(only ? null : APPS, { search });
  const all = list.data ?? [];
  const queue = useMemo(() => all.filter((a) => AWAITING.includes(a.status)), [all]);
  const details = useDetails(only ? [only.id] : queue.map((a) => a.id));
  const reload = useCallback(() => {
    list.reload();
    details.reload();
  }, [list, details]);
  useOnChange(reload);

  const shown = queue.filter((a) => (!classFilter || appClass(a) === classFilter) && (!status || a.status === status));
  // Narrowed, the request under review is that one application, whatever its stage.
  const current = only ? details.data[only.id] : (shown.find((a) => a.id === selected) ?? shown[0]);
  const cur = current ? details.data[current.id] : undefined;
  const years = useYears();
  const seats = useSeats(current?.academic_year_id ?? years.current?.id);

  useEffect(() => {
    setNote("");
    setFeeDue(false);
  }, [current?.id]);

  const week = (iso: string | null) => {
    const d = daysFromToday(iso);
    return d !== null && d >= -7;
  };
  const approvedWeek = all.filter((a) => ["approved", "fee_pending", "admitted"].includes(a.status) && week(a.decided_at)).length;
  const rejectedWeek = all.filter((a) => a.status === "rejected" && week(a.decided_at)).length;
  const oldest = queue.map((a) => a.submitted_at).filter((x): x is string => Boolean(x)).sort()[0];
  const oldestDays = oldest ? -(daysFromToday(oldest) ?? 0) : null;
  const n = (v: number) => (list.data ? String(v) : "…");
  const stats = [
    { label: "Awaiting review", value: n(queue.length), note: "Submitted, in verification or assessment" },
    { label: "Approved this week", value: n(approvedWeek), note: "Last seven days" },
    // "Returned" in the mock: the API has no return-for-information state, so rejections are shown.
    { label: "Rejected this week", value: n(rejectedWeek), note: "Last seven days" },
    { label: "Oldest request", value: oldestDays === null ? "—" : `${oldestDays} day${oldestDays === 1 ? "" : "s"}`, note: oldest ? `Submitted ${date(oldest)}` : "Nothing waiting" },
  ];

  async function decide(a: Application | undefined, approve: boolean) {
    if (!a) return;
    if (!approve && !note.trim()) {
      setError("Give a reason when rejecting an application.");
      return;
    }
    const who = a.student_name ?? "this applicant";
    if (!(await ask(approve ? `Approve the application for ${who}?` : `Reject the application for ${who}? The family is told the reason you gave.`))) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${APPS}/${a.id}/decide`, { approve, note: note.trim() || null, application_fee_due: approve ? feeDue : false });
      notify(approve ? `${a.student_name} approved.` : `${a.student_name} rejected.`);
      setSelected(null);
      emitChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  useOnAction("approve", () => decide(current, true));

  const docsOk = cur ? cur.documents_total > 0 && cur.documents_verified === cur.documents_total : false;
  const tests = (cur?.assessments ?? []).filter((t) => t.status !== "cancelled");
  const testsOk = tests.length > 0 && tests.every((t) => t.status === "done" && t.passed);
  const infoOk = cur ? Boolean(cur.dob && cur.gender && cur.guardian_name && cur.phone && (cur.class_id || cur.applying_for_class)) : false;
  const checklist: [string, boolean, string][] = [
    ["Application information", infoOk, infoOk ? "Complete" : "Some details are missing"],
    ["Required documents", docsOk, cur ? `${cur.documents_verified} of ${cur.documents_total} verified` : "…"],
    ["Assessment outcome", testsOk, assessmentSummary(cur)],
  ];
  const classSeats = current?.class_id ? seats.data?.find((c) => c.class_id === current.class_id) : undefined;
  checklist.push([
    "Class capacity",
    Boolean(classSeats && (!classSeats.capacity || (classSeats.available ?? 0) > 0)),
    !current ? "…" : !current.class_id ? "No class chosen on the application" : seats.loading && !seats.data ? "…" : classSeats ? `${classSeats.class_name}: ${seatText(classSeats)}` : "Class not found in this year",
  ]);
  const history = [...(cur?.history ?? [])].sort((x, z) => z.changed_at.localeCompare(x.changed_at)).slice(0, 5);
  const classes = [...new Set(queue.map(appClass))].sort();

  // The decision itself and how the application got here: the same panels
  // either side of the queue, and on their own in SCR-050's Approval tab.
  const review = (
    <>
      <Panel
        title="Review checklist"
        sub={only || !current ? undefined : `${current.student_name} · ${current.application_no}`}
        action={
          current && !only ? (
            <Link href={`${routeOf(50)}?id=${current.id}`} className="btn text">
              Open
            </Link>
          ) : undefined
        }
      >
        <div className="checklist">
          {checklist.map(([t, ok, sub]) => (
            <div className="check-item" key={t}>
              <input type="checkbox" aria-label={t} checked={ok} readOnly />
              <label>
                {t}
                <small>{sub}</small>
              </label>
            </div>
          ))}
        </div>
        <div className="gap" />
        <label className="field">
          <span>Decision note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required when rejecting" />
        </label>
        <label className="row small" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={feeDue} onChange={(e) => setFeeDue(e.target.checked)} />
          Collect the admission fee before admitting
        </label>
        <div className="gap" />
        <div className="actions">
          <button type="button" className="btn" disabled={busy || !current} onClick={() => decide(current, false)}>
            Reject
          </button>
          <button type="button" className="btn primary" disabled={busy || !current || current.status === "submitted"} onClick={() => decide(current, true)}>
            <Icon name="check" className="sm" />
            Approve
          </button>
        </div>
      </Panel>
      <Panel title="Approval history">
        {history.length ? (
          history.map((h, i) => (
            <div className="timeline-item" key={i}>
              <span className="timeline-dot">
                <Icon name={i === 0 ? "check" : "file"} />
              </span>
              <div>
                <h4>{h.from_status ? `${label(h.from_status)} → ${label(h.to_status)}` : label(h.to_status)}</h4>
                <p>{[h.note, h.changed_by_name ?? "School office"].filter(Boolean).join(" · ")}</p>
              </div>
              <time>{dateTime(h.changed_at)}</time>
            </div>
          ))
        ) : (
          <p className="muted">{current ? "No changes yet." : "Choose a request to review."}</p>
        )}
      </Panel>
    </>
  );

  if (only)
    return (
      <>
        <ErrorNote>{error}</ErrorNote>
        <div className="stack">{review}</div>
      </>
    );

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search admission approval…" aria-label="Search applications" />
        </div>
        <select aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {AWAITING.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>Requests awaiting approval</strong>
            <span>{`${shown.length} shown`}</span>
          </div>
          {shown.length ? (
            shown.map((a, i) => {
              const d = details.data[a.id];
              return (
                <article className="request-card" key={a.id} style={a.id === current?.id ? { outline: "2px solid var(--line)" } : undefined}>
                  <span className={`avatar ${TONES[i % 4]}`}>{initials(a.student_name)}</span>
                  <div className="request-info">
                    <h3>{a.student_name}</h3>
                    <p>{`Class: ${appClass(a)} · Assessment: ${assessmentSummary(d)} · Documents: ${a.documents_total ? `${a.documents_verified}/${a.documents_total} verified` : "—"}`}</p>
                    <p>{`${a.submitted_at ? `Submitted ${date(a.submitted_at)}` : "Not submitted"} · ${a.application_no} · Parent ${a.guardian_name}`}</p>
                  </div>
                  <div className="actions">
                    <Badge>{label(a.status)}</Badge>
                    <button type="button" className="btn" onClick={() => setSelected(a.id)}>
                      Review
                    </button>
                    <button type="button" className="btn primary" disabled={busy || a.status === "submitted"} title={a.status === "submitted" ? "Check the documents before approving" : undefined} onClick={() => decide(a, true)}>
                      <Icon name="check" className="sm" />
                      Approve
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted panel-pad">{list.loading ? "Loading…" : "No applications are waiting for a decision."}</p>
          )}
        </div>
        <aside className="stack">{review}</aside>
      </div>
    </>
  );
}
