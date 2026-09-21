"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { Ticket, TicketList } from "./types";

const COLUMNS: Ticket["status"][] = ["open", "waiting", "resolved", "closed"];
const PRIORITIES: Ticket["priority"][] = ["low", "normal", "high", "urgent"];
const EVENT = "platform:new-ticket";

/** Page-head "New ticket": opens the form in the board below. */
export function NewTicketButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event(EVENT))}>
      <Icon name="plus" className="sm" />
      New ticket
    </button>
  );
}

/**
 * SCR-017, live: GET /super-admin/tickets as a board by status; open one
 * (GET /tickets/{id}) to change status or priority (PATCH), reply or add an
 * internal note (POST /tickets/{id}/replies); raise one (POST /tickets).
 */
export function SupportTickets() {
  const queue = useApi<TicketList>("/api/v1/super-admin/tickets");
  const [typed, setTyped] = useState("");
  const [tenant, setTenant] = useState("");
  const [priority, setPriority] = useState("");
  const [raising, setRaising] = useState(false);
  const [open, setOpen] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const show = () => setRaising(true);
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  const tickets = useMemo(() => queue.data?.tickets ?? [], [queue.data]);
  const tenants = useMemo(() => Array.from(new Set(tickets.map((t) => t.tenant_name ?? "Platform"))).sort(), [tickets]);
  const shown = tickets.filter((t) => {
    const q = typed.trim().toLowerCase();
    return (
      (!q || t.subject.toLowerCase().includes(q) || String(t.id).includes(q)) &&
      (!tenant || (t.tenant_name ?? "Platform") === tenant) &&
      (!priority || t.priority === priority)
    );
  });

  async function step(fn: () => Promise<Ticket | void>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      const t = await fn();
      if (t) setOpen(t);
      if (done) notify(done);
      queue.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const view = (t: Ticket) => step(() => api.get<Ticket>(`/api/v1/super-admin/tickets/${t.id}`));
  const change = (field: "status" | "priority", value: string) => open && step(() => api.patch<Ticket>(`/api/v1/super-admin/tickets/${open.id}`, { [field]: value }), "Ticket updated.");

  async function raise(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await step(async () => {
      await api.post("/api/v1/super-admin/tickets", {
        subject: String(f.get("subject")).trim(),
        body: String(f.get("body")).trim(),
        priority: String(f.get("priority")),
      });
    }, "Ticket raised.");
    if (ok) setRaising(false);
  }

  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await step(
      () => api.post<Ticket>(`/api/v1/super-admin/tickets/${open.id}/replies`, { body: String(f.get("body")).trim(), is_internal: f.get("is_internal") === "on" }),
      "Reply added.",
    );
    if (ok) form.reset();
  }

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by subject or number…" aria-label="Search tickets" />
        </div>
        <select aria-label="Filter by organization" value={tenant} onChange={(e) => setTenant(e.target.value)}>
          <option value="">All organizations</option>
          {tenants.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? queue.error}</ErrorNote>
      {raising ? (
        <form className="panel" onSubmit={raise} style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div>
              <h2>New ticket</h2>
              <p>Raised by you, for the platform team</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                <span>
                  Subject<span className="req">*</span>
                </span>
                <input name="subject" required minLength={3} maxLength={200} placeholder="What is the problem?" />
              </label>
              <label className="field">
                <span>Priority</span>
                <select name="priority" defaultValue="normal">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field full">
                <span>
                  Details<span className="req">*</span>
                </span>
                <textarea name="body" required minLength={3} maxLength={8000} rows={4} placeholder="Describe what happened" />
              </label>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setRaising(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="check" className="sm" />
                Raise ticket
              </button>
            </div>
          </div>
        </form>
      ) : null}
      {open ? (
        <div className="two-col" style={{ marginBottom: 20 }}>
          <Panel
            title={`#${open.id} · ${open.subject}`}
            sub={`${open.tenant_name ?? "Platform"} · raised by ${open.raised_by ?? "—"} · ${dateTime(open.created_at)}`}
            action={
              <button type="button" className="btn" onClick={() => setOpen(null)}>
                Close
              </button>
            }
          >
            <p style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>{open.body}</p>
            {open.replies.map((r) => (
              <div className="timeline-item" key={r.id}>
                <span className="timeline-dot">
                  <Icon name={r.is_internal ? "shield" : "message"} />
                </span>
                <div>
                  <h4>{`${r.author ?? "—"}${r.is_internal ? " · internal note" : ""}`}</h4>
                  <p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>
                </div>
                <time>{dateTime(r.created_at)}</time>
              </div>
            ))}
            <form onSubmit={reply} className="stack" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Reply</span>
                <textarea name="body" required minLength={1} rows={3} placeholder="Write a reply" />
              </label>
              <div className="spread">
                <label className="small">
                  <input type="checkbox" name="is_internal" />
                  {" Internal note (not shown to the school)"}
                </label>
                <button type="submit" className="btn primary" disabled={busy}>
                  Send
                </button>
              </div>
            </form>
          </Panel>
          <aside className="stack">
            <Panel title="Ticket">
              <label className="field">
                <span>Status</span>
                <select value={open.status} onChange={(e) => change("status", e.target.value)} disabled={busy}>
                  {COLUMNS.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="gap" />
              <label className="field">
                <span>Priority</span>
                <select value={open.priority} onChange={(e) => change("priority", e.target.value)} disabled={busy}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="gap" />
              <dl className="kv">
                <div>
                  <dt>Assigned to</dt>
                  <dd>{open.assigned_to ?? "Nobody yet"}</dd>
                </div>
                <div>
                  <dt>Resolved</dt>
                  <dd>{open.resolved_at ? dateTime(open.resolved_at) : "—"}</dd>
                </div>
              </dl>
            </Panel>
          </aside>
        </div>
      ) : null}
      <div className="kanban">
        {COLUMNS.map((col) => {
          const cards = shown.filter((t) => t.status === col);
          return (
            <section className="kanban-col" key={col}>
              <div className="kanban-title">
                {label(col)}
                <span>{cards.length}</span>
              </div>
              {cards.map((t) => (
                <article
                  className="kanban-card"
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => view(t)}
                  onKeyDown={(e) => (e.key === "Enter" ? view(t) : undefined)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="spread">
                    <small>{`#${t.id}`}</small>
                    <Badge>{label(t.priority)}</Badge>
                  </div>
                  <h3>{t.subject}</h3>
                  <p>{`${t.tenant_name ?? "Platform"} · ${t.reply_count} ${t.reply_count === 1 ? "reply" : "replies"}`}</p>
                  <div className="spread">
                    <span className="avatar mint">{initials(t.raised_by ?? "?")}</span>
                    <span>{date(t.created_at)}</span>
                  </div>
                </article>
              ))}
              {!cards.length ? <p className="muted small">{queue.loading ? "Loading…" : "Nothing here."}</p> : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
