"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "./csv";

type Announcement = {
  id: number;
  title: string;
  body: string;
  audience: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  live: boolean;
  scheduled: boolean;
  finished: boolean;
  created_at: string;
};
type List = { announcements: Announcement[]; live: number; scheduled: number; finished: number };

const AUDIENCES = ["all", "school_admins", "principals", "teachers"];
const EVENT = "platform:new-announcement";
const today = () => new Date().toISOString().slice(0, 10);

function state(a: Announcement) {
  if (!a.is_active) return "Switched off";
  if (a.live) return "Live";
  if (a.scheduled) return "Scheduled";
  if (a.finished) return "Finished";
  return "—";
}

/** Page-head "Create announcement": opens the form below. */
export function NewAnnouncementButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event(EVENT))}>
      <Icon name="plus" className="sm" />
      Create announcement
    </button>
  );
}

/**
 * SCR-019, live: GET /super-admin/announcements; create (POST), switch off or
 * on (PATCH {is_active}) and remove (DELETE). An announcement is shown only
 * between its start and end dates.
 */
export function GlobalAnnouncements() {
  const list = useApi<List>("/api/v1/super-admin/announcements");
  const [typed, setTyped] = useState("");
  const [audience, setAudience] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const open = () => setAdding(true);
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);

  const all = useMemo(() => list.data?.announcements ?? [], [list.data]);
  const shown = all.filter((a) => {
    const q = typed.trim().toLowerCase();
    return (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)) && (!audience || a.audience === audience) && (!status || state(a) === status);
  });

  async function act(key: number | "new", fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      notify(done);
      list.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await act(
      "new",
      () =>
        api.post("/api/v1/super-admin/announcements", {
          title: String(f.get("title")).trim(),
          body: String(f.get("body")).trim(),
          audience: String(f.get("audience")),
          starts_on: String(f.get("starts_on")),
          ends_on: String(f.get("ends_on") ?? "") || null,
        }),
      "Announcement created.",
    );
    if (ok) setAdding(false);
  }

  const toggle = (a: Announcement) => act(a.id, () => api.patch(`/api/v1/super-admin/announcements/${a.id}`, { is_active: !a.is_active }), a.is_active ? "Announcement switched off." : "Announcement switched on.");
  const remove = (a: Announcement) => {
    if (!window.confirm(`Remove "${a.title}"?`)) return;
    act(a.id, () => api.delete(`/api/v1/super-admin/announcements/${a.id}`), "Announcement removed.");
  };

  const d = list.data;
  const stats = [
    { label: "Live now", value: d ? String(d.live) : "…", note: "Showing to schools" },
    { label: "Scheduled", value: d ? String(d.scheduled) : "…", note: "Start later" },
    { label: "Finished", value: d ? String(d.finished) : "…", note: "Past their end date" },
    { label: "All announcements", value: d ? String(all.length) : "…", note: "Kept for the record" },
  ];
  const runs = (a: Announcement) => `${date(a.starts_on)} – ${a.ends_on ? date(a.ends_on) : "no end date"}`;

  return (
    <>
      <StatStrip items={stats} compact />
      {adding ? (
        <form className="panel" onSubmit={create} style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div>
              <h2>Create announcement</h2>
              <p>Shown to the chosen audience in every school, between the two dates</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                <span>
                  Title<span className="req">*</span>
                </span>
                <input name="title" required minLength={3} maxLength={200} placeholder="Enter title" />
              </label>
              <label className="field">
                <span>Audience</span>
                <select name="audience" defaultValue="all">
                  {AUDIENCES.map((x) => (
                    <option key={x} value={x}>
                      {label(x)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>
                  Starts on<span className="req">*</span>
                </span>
                <input type="date" name="starts_on" required defaultValue={today()} />
              </label>
              <label className="field">
                <span>Ends on</span>
                <input type="date" name="ends_on" />
              </label>
              <label className="field full">
                <span>
                  Message<span className="req">*</span>
                </span>
                <textarea name="body" required minLength={3} maxLength={8000} rows={4} placeholder="Write the announcement" />
              </label>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy === "new"}>
                <Icon name="check" className="sm" />
                {busy === "new" ? "Saving…" : "Create announcement"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search announcements…" aria-label="Search announcements" />
        </div>
        <select aria-label="Filter by audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="">All audiences</option>
          {AUDIENCES.map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["Live", "Scheduled", "Finished", "Switched off"].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel
        title="All announcements"
        sub="Newest first"
        action={
          <button
            type="button"
            className="btn"
            disabled={!shown.length}
            onClick={() => downloadCsv("announcements.csv", ["Title", "Audience", "Starts", "Ends", "Status", "Message"], shown.map((a) => [a.title, label(a.audience), a.starts_on, a.ends_on ?? "", state(a), a.body]))}
          >
            <Icon name="download" className="sm" />
            Export
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Announcement</th>
                <th>Audience</th>
                <th>Runs</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td className="wrap">
                    <strong>{a.title}</strong>
                    <div className="small muted">{a.body.length > 120 ? `${a.body.slice(0, 120)}…` : a.body}</div>
                  </td>
                  <td>{label(a.audience)}</td>
                  <td>{runs(a)}</td>
                  <td>
                    <Badge>{state(a)}</Badge>
                  </td>
                  <td className="right">
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button type="button" className="btn" disabled={busy === a.id} onClick={() => toggle(a)}>
                        {a.is_active ? "Switch off" : "Switch on"}
                      </button>
                      <button type="button" className="btn" disabled={busy === a.id} onClick={() => remove(a)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={shown.length > 0}>
          {list.loading ? "Loading announcements…" : all.length ? "No announcements match these filters." : "No announcements yet."}
        </div>
        <div className="table-footer">
          <span>{`Showing ${shown.length} of ${all.length} records`}</span>
        </div>
      </Panel>
    </>
  );
}
