"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { AddNote, AuditItem, NotesPanel, PICK_PARENT, useParent, useParentNotes } from "./ParentShell";
import type { AuditEntry } from "./types";

/**
 * SCR-079, live: GET /parents/{id}, and two questions put to GET /audit-log —
 * what this parent did (user_id=) and what was done to their account
 * (entity_type=User&entity_id=). Kept apart so office edits never read as the parent's own.
 * Office notes: GET/POST/DELETE /parents/{id}/notes. Which list is shown
 * rides on ?view= so the page-head export takes the same one.
 */
export function ParentActivity() {
  const { id, data: p, error, loading } = useParent();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const view: "by" | "to" = params.get("view") === "to" ? "to" : "by";
  const setView = (v: "by" | "to") => {
    const q = new URLSearchParams(params.toString());
    if (v === "to") q.set("view", "to");
    else q.delete("view");
    router.replace(`${path}?${q.toString()}`, { scroll: false });
  };
  const byThem = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { user_id: id, limit: 200 });
  const toThem = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { entity_type: "User", entity_id: id, limit: 200 });
  const notes = useParentNotes(id);

  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  const list = view === "by" ? byThem : toThem;
  const entries = list.data ?? [];
  const num = (v: number | undefined) => (v === undefined ? "…" : String(v));
  const stats = [
    { label: "Done by parent", value: num(byThem.data?.length), note: byThem.data?.length === 200 ? "Latest 200" : "Changes they made" },
    { label: "Done to account", value: num(toThem.data?.length), note: toThem.data?.length === 200 ? "Latest 200" : "Changes by the office" },
    { label: "Last sign-in", value: p.last_login_at ? date(p.last_login_at) : "Never", note: p.is_active ? "Account active" : "Account inactive" },
    { label: "Office notes", value: num(notes.data?.length), note: "Follow-ups recorded" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <ErrorNote>{list.error}</ErrorNote>
          <Panel
            title="Activity history"
            sub={`${entries.length} entr${entries.length === 1 ? "y" : "ies"}${list.loading ? " · Loading…" : ""}`}
            action={
              <select aria-label="Whose activity" value={view} onChange={(e) => setView(e.target.value as "by" | "to")}>
                <option value="by">{`Done by ${p.full_name.split(/\s+/)[0]}`}</option>
                <option value="to">Done to the account</option>
              </select>
            }
          >
            {entries.length ? (
              entries.map((e) => <AuditItem key={e.id} e={e} />)
            ) : (
              <p className="muted">{list.loading ? "Loading…" : view === "by" ? "This parent has not changed anything yet." : "Nothing recorded on this account yet."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Record information">
            <dl className="kv">
              <div>
                <dt>Student</dt>
                <dd>{p.children.map((c) => c.full_name).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{[...new Set(p.children.map((c) => c.section_label ?? "—"))].join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{p.last_login_at ? dateTime(p.last_login_at) : "Never"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{p.is_active ? "Active" : "Inactive"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Next action">
            <p className="muted small">Review the latest activity and record any follow-up; portal access and passwords are managed on Login access.</p>
            <div className="gap" />
            <div className="actions">
              <AddNote id={String(p.user_id)} onAdded={notes.reload} />
              <Link href={`${routeOf(76)}?id=${p.user_id}`} className="btn">
                <Icon name="arrow" className="sm" />
                Login access
              </Link>
            </div>
          </Panel>
          <NotesPanel id={String(p.user_id)} notes={notes.data} loading={notes.loading} onChange={notes.reload} />
        </aside>
      </div>
    </>
  );
}

/** "Export history": GET /audit-log.csv for the list on screen, fetched with the token. */
export function ExportHistoryButton() {
  const params = useSearchParams();
  const id = params.get("id");
  const view = params.get("view") === "to" ? "to" : "by";
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!id) return;
    setBusy(true);
    try {
      const q = view === "to" ? { entity_type: "User", entity_id: id, limit: 5000 } : { user_id: id, limit: 5000 };
      await api.download("/api/v1/school/audit-log.csv", `parent-${id}-${view === "to" ? "account" : "activity"}.csv`, q);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn primary" disabled={!id || busy} onClick={run}>
      <Icon name="download" className="sm" />
      {busy ? "Exporting…" : "Export history"}
    </button>
  );
}
