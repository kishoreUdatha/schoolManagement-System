"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { ATTACH_ACCEPT, ATTACH_RULES, fileSize, filesForm, openAttachment, type Attachment } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ActionLink, childPath, ChildScoped, dateRange, longDate, PmEmpty, PmError, PmLoading, shortDate, todayIso } from "../home/parts";

export type LeaveKind = "sick" | "family" | "travel" | "religious" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type StudentLeave = {
  id: number;
  student_id: number;
  kind: LeaveKind;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  applied_by_name: string | null;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  /** Supporting documents (medical note…). */
  attachments?: Attachment[];
};

export const KINDS: [LeaveKind, string][] = [
  ["sick", "Medical"],
  ["family", "Family reason"],
  ["travel", "Travel"],
  ["religious", "Religious / festival"],
  ["other", "Other"],
];
const kindLabel = (k: LeaveKind) => KINDS.find(([v]) => v === k)?.[1] ?? k;
const TITLE: Record<LeaveKind, string> = {
  sick: "Medical leave",
  family: "Family leave",
  travel: "Travel leave",
  religious: "Religious / festival leave",
  other: "Leave",
};
const STATUS: Record<LeaveStatus, [label: string, value: string, pill: string]> = {
  pending: ["Pending", "warning", "status amber"],
  approved: ["Approved", "good", "status"],
  rejected: ["Declined", "bad", "status amber"],
  cancelled: ["Cancelled", "", "status blue"],
};
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const leavesPath = (childId: number) => childPath(childId, "/leaves");

/** A leave can be withdrawn while pending, or once approved if it has not started. */
const cancellable = (lv: StudentLeave) => lv.status === "pending" || (lv.status === "approved" && lv.from_date > todayIso());

/** PM-011. The child's leave requests, newest first. */
export function LeaveRequests() {
  return <ChildScoped render={(childId) => <ListFor childId={childId} />} />;
}

function ListFor({ childId }: { childId: number }) {
  const router = useRouter();
  const list = useApi<StudentLeave[]>(leavesPath(childId));
  return (
    <>
      <PmError>{list.error}</PmError>
      {!list.data && !list.error ? <PmLoading /> : null}
      {list.data && list.data.length === 0 ? <PmEmpty title="No leave requests yet">Requests you send to the class teacher appear here.</PmEmpty> : null}
      {(list.data ?? []).map((lv) => (
        <button key={lv.id} className="item" onClick={() => router.push(`${parentRoute(13)}?id=${lv.id}`)}>
          <span>
            <strong>{TITLE[lv.kind]}</strong>
            <small>{`${lv.from_date === lv.to_date ? shortDate(lv.from_date) : `${shortDate(lv.from_date)} – ${shortDate(lv.to_date)}`} · ${days(lv.days)}`}</small>
          </span>
          <span className={`value ${STATUS[lv.status][1]}`}>{STATUS[lv.status][0]}</span>
        </button>
      ))}
      <ActionLink href={parentRoute(12)}>Apply for leave</ActionLink>
    </>
  );
}

/** PM-012. Ask the class teacher for leave (POST /leaves). */
export function ApplyForLeave() {
  return <ChildScoped render={(childId, child) => <ApplyFor childId={childId} name={child.full_name.split(/\s+/)[0]} />} />;
}

function ApplyFor({ childId, name }: { childId: number; name: string }) {
  const router = useRouter();
  const { notify } = useParent();
  const today = todayIso();
  const [f, setF] = useState<{ kind: LeaveKind; from_date: string; to_date: string; reason: string }>({ kind: "sick", from_date: today, to_date: today, reason: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.reason.trim().length < 3) {
      setError("Tell the school why leave is needed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const lv = await api.post<StudentLeave>(leavesPath(childId), { ...f, reason: f.reason.trim() });
      if (files.length) {
        try {
          await api.upload(`${leavesPath(childId)}/${lv.id}/files`, filesForm(files));
        } catch (err) {
          // The request is in; say so, and let the parent add the document from the request.
          notify(`Leave request sent, but the document was not attached: ${errorText(err)} You can add it from the request.`);
          router.push(`${parentRoute(13)}?id=${lv.id}`);
          return;
        }
      }
      notify("Sent to the class teacher. You will get a notice when it is decided.");
      router.push(`${parentRoute(13)}?id=${lv.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="lead">{`Leave for ${name}`}</p>
      <label className="field">
        Leave type
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as LeaveKind })}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">
          From
          <input
            type="date"
            required
            value={f.from_date}
            onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: e.target.value > f.to_date ? e.target.value : f.to_date })}
          />
        </label>
        <label className="field">
          To
          <input type="date" required min={f.from_date} value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
        </label>
      </div>
      <label className="field">
        Reason
        <textarea rows={3} required minLength={3} placeholder="Tell the school why leave is needed" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </label>
      <div className="upload-box">
        <b>Supporting document (optional)</b>
        <p>{`A medical note or letter, if you have one. ${ATTACH_RULES}.`}</p>
        <label className="field">
          Document
          <input type="file" multiple accept={ATTACH_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      {error ? (
        <p className="micro bad" role="alert">
          {error}
        </p>
      ) : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Submit leave request"}
      </button>
      <p className="micro">Attendance changes only after the school records it.</p>
    </form>
  );
}

/** PM-013. One leave request (?id=), found in the child's list; cancel while it can still be withdrawn. */
export function LeaveRequestDetail() {
  return <ChildScoped render={(childId) => <DetailFor childId={childId} />} />;
}

function DetailFor({ childId }: { childId: number }) {
  const id = Number(useSearchParams().get("id"));
  const { notify } = useParent();
  const list = useApi<StudentLeave[]>(leavesPath(childId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (list.error) return <PmError>{list.error}</PmError>;
  if (!list.data) return <PmLoading />;
  const lv = list.data.find((x) => x.id === id);
  if (!lv) {
    return (
      <>
        <PmEmpty title="Leave request not found">It may belong to another child. Choose a request from the list.</PmEmpty>
        <ActionLink secondary href={parentRoute(11)}>
          My leave requests
        </ActionLink>
      </>
    );
  }

  async function cancel() {
    if (!window.confirm("Cancel this leave request?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${leavesPath(childId)}/${lv!.id}/cancel`);
      notify("Leave request cancelled.");
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function addDoc(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      await api.upload(`${leavesPath(childId)}/${lv!.id}/files`, filesForm(files));
      notify("Document attached.");
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(a: Attachment) {
    if (!window.confirm(`Remove “${a.file_name}”?`)) return;
    setError(null);
    try {
      await api.delete(`${leavesPath(childId)}/${lv!.id}/files/${a.id}`);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const [statusLabel, , pill] = STATUS[lv.status];
  return (
    <>
      <span className={pill}>{statusLabel}</span>
      <h2>{TITLE[lv.kind]}</h2>
      <dl>
        <div>
          <dt>Request</dt>
          <dd>{`#${lv.id}`}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{kindLabel(lv.kind)}</dd>
        </div>
        <div>
          <dt>Dates</dt>
          <dd>{dateRange(lv.from_date, lv.to_date)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{`${lv.days} school ${lv.days === 1 ? "day" : "days"}`}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{dateTime(lv.created_at)}</dd>
        </div>
      </dl>
      <section className="section">
        <h3>Reason</h3>
        <p>{lv.reason}</p>
      </section>
      {lv.attachments?.length || lv.status === "pending" ? (
        <section className="section">
          <h3>Supporting documents</h3>
          {(lv.attachments ?? []).map((a) => (
            <div key={a.id} className="item">
              <button type="button" className="text-button" style={{ textAlign: "left", flex: 1 }} onClick={() => openAttachment(`${leavesPath(childId)}/${lv.id}/files/${a.id}`, a).catch((e) => setError(errorText(e)))}>
                <span>
                  <strong>{a.file_name}</strong>
                  <small>{fileSize(a.size_bytes)}</small>
                </span>
              </button>
              <span className="value">
                {lv.status === "pending" ? (
                  <button type="button" className="text-button" onClick={() => removeDoc(a)}>
                    Remove
                  </button>
                ) : (
                  "Open"
                )}
              </span>
            </div>
          ))}
          {lv.status === "pending" ? (
            <label className="field">
              {lv.attachments?.length ? "Add another document" : "Add a document (medical note, letter)"}
              <input type="file" accept={ATTACH_ACCEPT} disabled={busy} onChange={(e) => addDoc(Array.from(e.target.files ?? []))} />
            </label>
          ) : null}
        </section>
      ) : null}
      <section className="section">
        <h3>Request timeline</h3>
        <div className="timeline">
          <p>
            <b>Request submitted</b>
            <small>{`${lv.applied_by_name ?? "Parent"} · ${longDate(lv.created_at)}`}</small>
          </p>
          {lv.status === "pending" ? (
            <p>
              <b>Awaiting class teacher</b>
              <small>You will receive a notification.</small>
            </p>
          ) : lv.status === "cancelled" ? (
            <p>
              <b>Cancelled</b>
              <small>{lv.decided_at ? longDate(lv.decided_at) : "Withdrawn"}</small>
            </p>
          ) : (
            <p>
              <b>{lv.status === "approved" ? "Approved" : "Declined"}</b>
              <small>{[lv.decided_by_name, lv.decided_at ? longDate(lv.decided_at) : null].filter(Boolean).join(" · ")}</small>
              {lv.decision_note ? <small>{lv.decision_note}</small> : null}
            </p>
          )}
        </div>
      </section>
      {error ? (
        <p className="micro bad" role="alert">
          {error}
        </p>
      ) : null}
      {cancellable(lv) ? (
        <button className="action secondary" onClick={cancel} disabled={busy}>
          {busy ? "Cancelling…" : "Cancel request"}
        </button>
      ) : null}
    </>
  );
}
