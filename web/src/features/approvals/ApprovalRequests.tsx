"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import { KIND_EFFECT, KIND_LABEL, STATUS_LABEL, type Approval, type ApprovalKind, type ApprovalStatus, type Exam } from "./types";

import { ask } from "@/lib/dialog";
const TONES = ["mint", "", "peach", "lilac"];
const DAY = 86_400_000;
const NEW_EVENT = "approvals:new";

/** Page-head "New request": only a school admin (or a teacher) may file one. */
export function NewApprovalButton() {
  const role = useSession()?.user.role;
  if (role !== "school_admin") return null;
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event(NEW_EVENT))}>
      <Icon name="plus" className="sm" />
      New request
    </button>
  );
}

/** A payload value as a person reads it; exam ids become exam names when known. */
function payloadRows(a: Approval, exams: Map<number, string>): [string, string][] {
  return Object.entries(a.payload ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      if (k === "exam_id") return ["Exam", exams.get(Number(v)) ?? `Exam #${v}`];
      const text = typeof v === "object" ? JSON.stringify(v) : String(v);
      return [label(k.replace(/_id$/, "")), /^\d{4}-\d{2}-\d{2}$/.test(text) ? date(text) : text];
    });
}

function summary(a: Approval, exams: Map<number, string>): string {
  const bits = payloadRows(a, exams).map(([k, v]) => `${k}: ${v}`);
  return bits.length ? bits.join(" · ") : "No details attached";
}

/**
 * NEW-080, live. School admin: GET /school/approvals (every request in the
 * school) and POST /school/approvals to file one. Principal:
 * GET /principal/approvals and POST /principal/approvals/{id}/decide.
 * Each request shows who asked, what, when, and who decided with what remark.
 */
export function ApprovalRequests() {
  const hydrated = useHydrated();
  const role = useSession()?.user.role;
  if (!hydrated) return <Loading what="Loading approval requests…" />;
  if (role !== "school_admin" && role !== "principal") {
    return <ErrorNote>Approval requests are kept by the school office and decided by the principal. Your role cannot see this queue.</ErrorNote>;
  }
  return <Queue principal={role === "principal"} />;
}

function Queue({ principal }: { principal: boolean }) {
  const base = principal ? "/api/v1/principal/approvals" : "/api/v1/school/approvals";
  const list = useApi<Approval[]>(base, { limit: 500 });
  // Exam names for result-publishing requests; the principal portal has no exam list.
  const examList = useApi<Exam[]>(principal ? null : "/api/v1/school/exams");
  const [status, setStatus] = useState<ApprovalStatus | "">("pending");
  const [kind, setKind] = useState<ApprovalKind | "">("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    const open = () => setFiling(true);
    window.addEventListener(NEW_EVENT, open);
    return () => window.removeEventListener(NEW_EVENT, open);
  }, []);

  const exams = useMemo(() => new Map((examList.data ?? []).map((e) => [e.id, e.name])), [examList.data]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const q = search.trim().toLowerCase();
  const shown = all.filter(
    (a) =>
      (!status || a.status === status) &&
      (!kind || a.kind === kind) &&
      (!q || [a.requested_by_name, a.reason, KIND_LABEL[a.kind], a.reviewed_by_name, a.decision_remark].some((v) => v?.toLowerCase().includes(q))),
  );
  const current = all.find((a) => a.id === picked) ?? shown[0] ?? null;
  useEffect(() => setRemark(""), [current?.id]);

  const now = Date.now();
  const pending = all.filter((a) => a.status === "pending");
  const oldest = pending.reduce<string | null>((o, a) => (!o || a.created_at < o ? a.created_at : o), null);
  const oldestDays = oldest ? Math.floor((now - new Date(oldest).getTime()) / DAY) : null;
  const decided30 = all.filter((a) => a.decided_at && now - new Date(a.decided_at).getTime() < 30 * DAY);
  const stats = [
    { label: "Waiting for decision", value: list.data ? String(pending.length) : "…", note: principal ? "Your queue" : "With the principal" },
    { label: "Approved (30 days)", value: list.data ? String(decided30.filter((a) => a.status === "approved").length) : "…", note: "Decided in the last 30 days" },
    { label: "Rejected (30 days)", value: list.data ? String(decided30.filter((a) => a.status === "rejected").length) : "…", note: "Sent back with a remark" },
    { label: "Oldest waiting", value: oldestDays === null ? "—" : `${oldestDays} day${oldestDays === 1 ? "" : "s"}`, note: oldest ? `Filed ${date(oldest)}` : "Nothing waiting" },
  ];

  async function decide(a: Approval, decision: "approved" | "rejected") {
    if (decision === "rejected" && !remark.trim()) {
      setError("Say why the request is rejected, so the person who asked knows what to do next.");
      return;
    }
    if (decision === "approved" && a.kind === "result_publishing" && !(await ask("Approving publishes these results to parents and students now. Continue?"))) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<Approval>(`/api/v1/principal/approvals/${a.id}/decide`, { status: decision, decision_remark: remark.trim() || null });
      notify(`${KIND_LABEL[a.kind]} ${decision === "approved" ? "approved" : "rejected"}.`);
      setRemark("");
      setPicked(null);
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by person, reason or remark…" aria-label="Search approval requests" />
        </div>
        <select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value as ApprovalKind | "")}>
          <option value="">All request types</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus | "")}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{status === "pending" ? "Requests awaiting approval" : "Approval requests"}</strong>
            <span>{list.loading ? "Loading…" : `${shown.length} shown`}</span>
          </div>
          {shown.length === 0 ? (
            <p className="panel-pad muted">{list.loading ? "Loading requests…" : status === "pending" ? "Nothing is waiting for a decision." : "No requests match these filters."}</p>
          ) : null}
          {shown.map((a, i) => (
            <article className="request-card" key={a.id} style={current?.id === a.id ? { background: "#f4f8ff" } : undefined}>
              <span className={`avatar ${TONES[i % 4]}`}>{initials(a.requested_by_name ?? "?")}</span>
              <div className="request-info">
                <h3>{`${KIND_LABEL[a.kind]} · ${a.requested_by_name ?? "Unknown requester"}`}</h3>
                <p>{a.reason || "No reason given"}</p>
                <p>{`${summary(a, exams)} · Filed ${dateTime(a.created_at)}`}</p>
              </div>
              <div className="actions">
                <Badge>{STATUS_LABEL[a.status]}</Badge>
                <button type="button" className="btn" onClick={() => setPicked(a.id)}>
                  {principal && a.status === "pending" ? "Review" : "Open"}
                </button>
              </div>
            </article>
          ))}
        </div>
        <aside className="stack">
          {current ? (
            <Panel title={`${KIND_LABEL[current.kind]} #${current.id}`} sub={`${current.requested_by_name ?? "Unknown requester"} · ${dateTime(current.created_at)}`} action={<Badge>{STATUS_LABEL[current.status]}</Badge>}>
              <dl className="kv">
                <div>
                  <dt>Requested by</dt>
                  <dd>{current.requested_by_name ?? "—"}</dd>
                </div>
                <div>
                  <dt>Request</dt>
                  <dd>{KIND_LABEL[current.kind]}</dd>
                </div>
                <div>
                  <dt>Filed</dt>
                  <dd>{dateTime(current.created_at)}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd style={{ whiteSpace: "pre-line" }}>{current.reason || "—"}</dd>
                </div>
                {payloadRows(current, exams).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="muted small" style={{ marginTop: 10 }}>
                {KIND_EFFECT[current.kind]}
              </p>
              {principal && current.status === "pending" ? (
                <div className="stack" style={{ marginTop: 14 }}>
                  <label className="field">
                    <span>Decision remark</span>
                    <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Required when rejecting" maxLength={2000} />
                  </label>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn primary" disabled={busy} onClick={() => decide(current, "approved")}>
                      <Icon name="check" className="sm" />
                      {busy ? "Saving…" : "Approve"}
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => decide(current, "rejected")}>
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}
            </Panel>
          ) : null}
          <Panel title="Decision trail" sub={current ? `Request #${current.id}` : "Pick a request"}>
            {current ? (
              <>
                <div className="timeline-item">
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{`Filed by ${current.requested_by_name ?? "unknown"}`}</h4>
                    <p>{current.reason || "No reason given"}</p>
                  </div>
                  <time>{dateTime(current.created_at)}</time>
                </div>
                {current.status === "pending" ? (
                  <div className="timeline-item">
                    <span className="timeline-dot">
                      <Icon name="clock" />
                    </span>
                    <div>
                      <h4>Waiting for the principal</h4>
                      <p>{`${Math.max(0, Math.floor((now - new Date(current.created_at).getTime()) / DAY))} day(s) so far`}</p>
                    </div>
                  </div>
                ) : (
                  <div className="timeline-item">
                    <span className="timeline-dot">
                      <Icon name={current.status === "approved" ? "check" : "bell"} />
                    </span>
                    <div>
                      <h4>{`${STATUS_LABEL[current.status]} by ${current.reviewed_by_name ?? "unknown"}`}</h4>
                      <p>{current.decision_remark ? `“${current.decision_remark}”` : "No remark"}</p>
                    </div>
                    <time>{dateTime(current.decided_at)}</time>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">{list.loading ? "Loading…" : "Nothing to show."}</p>
            )}
          </Panel>
          {!principal ? (
            <div className="aside-panel">
              <h3>Who decides</h3>
              <p>Requests filed here go to the principal, who approves or rejects each one with a remark. Approving a result-publishing request publishes the exam at once.</p>
            </div>
          ) : null}
        </aside>
      </div>
      {filing ? (
        <FileRequest
          exams={examList.data ?? []}
          onClose={() => setFiling(false)}
          onFiled={(a) => {
            setFiling(false);
            setStatus("pending");
            setPicked(a.id);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** POST /api/v1/school/approvals: a kind, a reason and the details the principal needs. */
function FileRequest({ exams, onClose, onFiled }: { exams: Exam[]; onClose: () => void; onFiled: (a: Approval) => void }) {
  const [kind, setKind] = useState<ApprovalKind>("result_publishing");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const payload: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => {
      if (v !== "" && v !== null && !(typeof v === "number" && Number.isNaN(v))) payload[k] = v;
    };
    if (kind === "result_publishing" || kind === "marks_correction") put("exam_id", text("exam_id") ? Number(text("exam_id")) : "");
    if (kind === "marks_correction") {
      put("student", text("student"));
      put("subject", text("subject"));
      put("old_value", text("old_value") ? Number(text("old_value")) : "");
      put("new_value", text("new_value") ? Number(text("new_value")) : "");
    }
    if (kind === "attendance_edit") {
      put("date", text("date"));
      put("section", text("section"));
      put("change", text("change"));
    }
    if (kind === "staff_leave") {
      put("staff", text("staff"));
      put("from", text("from"));
      put("to", text("to"));
    }
    if (kind === "result_publishing" && !payload.exam_id) {
      setError("Choose the exam whose results should be published.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const a = await api.post<Approval>("/api/v1/school/approvals", { kind, reason: text("reason") || null, payload });
      notify("Request sent to the principal.");
      onFiled(a);
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
  const examSelect = (required: boolean) => (
    <select name="exam_id" required={required} defaultValue="">
      <option value="">{required ? "Choose an exam" : "Not tied to an exam"}</option>
      {exams.map((x) => (
        <option key={x.id} value={x.id}>
          {`${x.name}${x.academic_year_name ? ` · ${x.academic_year_name}` : ""}${x.is_published ? " (published)" : ""}`}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog
      open
      wide
      title="New approval request"
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Sending…" : "Send to principal"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        {field(
          "Request type",
          <select value={kind} onChange={(e) => setKind(e.target.value as ApprovalKind)}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>,
          true,
        )}
        {kind === "result_publishing" ? field("Exam", examSelect(true), true) : null}
        {kind === "marks_correction" ? (
          <>
            {field("Exam", examSelect(false))}
            {field("Student", <input name="student" placeholder="Name or admission no." maxLength={120} />)}
            {field("Subject", <input name="subject" maxLength={80} />)}
            {field("Mark now", <input name="old_value" type="number" step="0.01" min={0} />)}
            {field("Corrected mark", <input name="new_value" type="number" step="0.01" min={0} />)}
          </>
        ) : null}
        {kind === "attendance_edit" ? (
          <>
            {field("Date", <input name="date" type="date" />)}
            {field("Class and section", <input name="section" placeholder="e.g. Grade 5 A" maxLength={60} />)}
            {field("Change", <input name="change" placeholder="e.g. Mark 3 students present" maxLength={200} />)}
          </>
        ) : null}
        {kind === "staff_leave" ? (
          <>
            {field("Staff member", <input name="staff" maxLength={120} />)}
            {field("From", <input name="from" type="date" />)}
            {field("To", <input name="to" type="date" />)}
          </>
        ) : null}
        <label className="field full">
          <span>Reason</span>
          <textarea name="reason" placeholder="What should change and why" maxLength={2000} />
        </label>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {KIND_EFFECT[kind]}
      </p>
    </Dialog>
  );
}
