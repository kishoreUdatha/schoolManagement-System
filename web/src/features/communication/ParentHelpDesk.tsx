"use client";

/*
 * NEW-026 · Parent help desk. Requests parents send to the school office
 * from the app (GET /api/v1/school/parent-services/help-tickets, one with its
 * thread from …/help-tickets/{id}), a reply box (POST …/replies, which tells
 * the parent) and the status (POST …/status). Beside it, the school's
 * communication hours and office desk details parents see in the app
 * (GET + PUT …/settings; saving is for the school admin).
 */

import { useEffect, useState, type FormEvent } from "react";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";

const S = "/api/v1/school/parent-services";

type Status = "open" | "in_progress" | "resolved";
type Ticket = {
  id: number;
  parent_name: string | null;
  student_name: string | null;
  category: string;
  subject: string;
  status: Status;
  assigned_to_name: string | null;
  last_activity_at: string | null;
  last_reply: string | null;
  created_at: string;
  replies: { id: number; author_name: string | null; from_parent: boolean; body: string; created_at: string }[] | null;
};
type Settings = {
  communication_hours: string | null;
  office_hours: string | null;
  office_phone: string | null;
  office_email: string | null;
  help_desk_note: string | null;
};

const STATUS: Record<Status, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const TONES = ["mint", "", "peach", "lilac"];
const rowStyle = (active: boolean) => ({ width: "100%", textAlign: "left" as const, background: active ? "#edf4ff" : "#fff" });

export function ParentHelpDesk() {
  const [filter, setFilter] = useState<Status | "">("");
  const tickets = useApi<Ticket[]>(`${S}/help-tickets`, { status: filter || undefined });
  const [activeId, setActiveId] = useState<number | null>(null);
  const list = tickets.data ?? [];
  const active = list.find((t) => t.id === activeId) ?? list[0] ?? null;

  return (
    <>
      <section className="panel">
        <div className="message-layout">
          <aside className="message-list">
            <div style={{ padding: "16px" }}>
              <label className="field">
                <span>Show</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as Status | "")}>
                  <option value="">All requests</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
            </div>
            {list.map((t, i) => (
              <button key={t.id} type="button" className={`conversation ${active?.id === t.id ? "active" : ""}`} style={rowStyle(active?.id === t.id)} onClick={() => setActiveId(t.id)}>
                <span className={`avatar ${TONES[i % 4]}`}>{initials(t.parent_name ?? "?")}</span>
                <div>
                  <strong>
                    {t.subject} · {STATUS[t.status]}
                  </strong>
                  <p>{`${t.parent_name ?? "Parent"}${t.student_name ? ` · ${t.student_name}` : ""} · ${t.category}`}</p>
                </div>
              </button>
            ))}
            {!list.length ? (
              <p className="muted small" style={{ padding: "0 16px 16px" }}>
                {tickets.loading ? "Loading…" : "No requests. Parents send them from Help & requests in the parent app."}
              </p>
            ) : null}
          </aside>
          <div className="message-content">
            <ErrorNote>{tickets.error}</ErrorNote>
            {active ? <TicketThread key={active.id} id={active.id} onChanged={tickets.reload} /> : <div className="panel-pad muted">Choose a request.</div>}
          </div>
        </div>
      </section>
      <HoursSettings />
    </>
  );
}

function TicketThread({ id, onChanged }: { id: number; onChanged: () => void }) {
  const t = useApi<Ticket>(`${S}/help-tickets/${id}`);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      notify(done);
      t.reload();
      onChanged();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    run(async () => {
      await api.post(`${S}/help-tickets/${id}/replies`, { body: draft.trim() });
      setDraft("");
    }, "Reply sent. The parent has been told.");
  }

  if (t.loading && !t.data) return <Loading what="Loading the request…" />;
  if (!t.data) return <ErrorNote>{t.error ?? "Request not found."}</ErrorNote>;
  const k = t.data;
  const setStatus = (s: Status) => run(() => api.post(`${S}/help-tickets/${id}/status`, { status: s }), `Marked ${STATUS[s].toLowerCase()}.`);

  return (
    <>
      <div className="message-head">
        <div className="person">
          <span className="avatar mint">{initials(k.parent_name ?? "?")}</span>
          <div>
            {k.subject}
            <small>{`${k.parent_name ?? "Parent"}${k.student_name ? ` · about ${k.student_name}` : ""} · ${k.category} · #${k.id}${k.assigned_to_name ? ` · ${k.assigned_to_name}` : ""}`}</small>
          </div>
        </div>
        <div className="gap">
          <Badge>{STATUS[k.status]}</Badge>
          {k.status === "resolved" ? (
            <button type="button" className="btn" disabled={busy} onClick={() => setStatus("open")}>
              Reopen
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setStatus("resolved")}>
              Mark resolved
            </button>
          )}
        </div>
      </div>
      <div className="messages">
        <ErrorNote>{failed}</ErrorNote>
        {(k.replies ?? []).map((m) => (
          <div key={m.id} className={`bubble ${m.from_parent ? "" : "out"}`} style={{ whiteSpace: "pre-line" }}>
            {m.body}
            <small>{`${m.from_parent ? "Parent" : m.author_name ?? "Office"} · ${dateTime(m.created_at)}`}</small>
          </div>
        ))}
      </div>
      <form className="message-compose" onSubmit={send}>
        <input aria-label="Write a reply" placeholder="Write a reply to the parent…" required value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reply"}
        </button>
      </form>
    </>
  );
}

function HoursSettings() {
  const sess = useSession();
  const canEdit = sess?.user.role === "school_admin";
  const s = useApi<Settings>(`${S}/settings`);
  const [f, setF] = useState<Settings>({ communication_hours: "", office_hours: "", office_phone: "", office_email: "", help_desk_note: "" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (s.data) setF({ ...s.data });
  }, [s.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(null);
    try {
      await api.put(`${S}/settings`, f);
      notify("Saved. Parents see the new hours in the app.");
      s.reload();
    } catch (err) {
      setFailed(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof Settings, text: string, hint: string, max: number) => (
    <label className="field">
      <span>{text}</span>
      <input value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={hint} maxLength={max} disabled={!canEdit} />
    </label>
  );

  return (
    <Panel title="Hours parents see" sub="Shown in the parent app’s messages and Help & requests. The office phone and email default to the school profile.">
      <ErrorNote>{failed ?? s.error}</ErrorNote>
      <form onSubmit={save}>
        <div className="form-grid">
          {field("communication_hours", "School communication hours", "Mon–Fri, 8:00 am – 4:00 pm", 200)}
          {field("office_hours", "Office help desk hours", "Mon–Sat, 9:00 am – 1:00 pm", 200)}
          {field("office_phone", "Office phone", "+91 80 1234 5678", 20)}
          {field("office_email", "Office email", "office@school.edu", 255)}
          {field("help_desk_note", "Note for parents", "We reply within one working day", 300)}
        </div>
        {canEdit ? (
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save hours"}
          </button>
        ) : (
          <p className="muted small">Only the school admin changes these.</p>
        )}
      </form>
    </Panel>
  );
}
