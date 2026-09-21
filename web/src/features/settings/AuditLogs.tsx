"use client";

import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { download } from "./files";
import type { AuditEntry } from "./types";

const LIMIT = 50;
const ACTION: Record<string, string> = { create: "Created record", update: "Updated record", delete: "Deleted record" };

type Filters = { action: string; entity_type: string; from: string; to: string };

/** What changed, by field name, from the old and new values the log keeps. */
function changed(e: AuditEntry): string {
  const keys = new Set([...Object.keys(e.old_values ?? {}), ...Object.keys(e.new_values ?? {})]);
  const list = [...keys].filter((k) => k !== "id" && k !== "updated_at");
  if (!list.length) return "—";
  return list.length > 3 ? `${list.slice(0, 3).map(label).join(", ")} +${list.length - 3}` : list.map(label).join(", ");
}

/**
 * SCR-294, live: GET /audit-log with action, record type and date filters,
 * fifty at a time (limit/offset; the API returns no total). "Export log"
 * downloads GET /audit-log.csv with the same filters.
 */
export function AuditLogs() {
  const [typed, setTyped] = useState("");
  const [f, setF] = useState<Filters>({ action: "", entity_type: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, entity_type: typed.trim() })), 400);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [f]);

  const list = useApi<AuditEntry[]>("/api/v1/school/audit-log", { ...f, limit: LIMIT, offset: (page - 1) * LIMIT });
  const items = list.data ?? [];
  const full = items.length === LIMIT;

  const rows: Row[] = items.map((e) => [
    dateTime(e.created_at),
    { name: e.user_name ?? "System", sub: e.user_role ? label(e.user_role) : (e.user_email ?? undefined) },
    ACTION[e.action] ?? label(e.action),
    `${e.entity_type}${e.entity_id ? ` #${e.entity_id}` : ""}`,
    changed(e),
    e.request_path ?? "—",
  ]);

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Exact record type, e.g. Student or Branch" aria-label="Filter by record type" />
        </div>
        <select aria-label="Filter by action" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
          <option value="">All actions</option>
          <option value="create">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>
        <input type="date" aria-label="From date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <input type="date" aria-label="To date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Activity log" sub={`Latest changes first · ${items.length} on this page${list.loading ? " · Loading…" : ""}`} action={<span className="badge">Read only</span>} flush>
        {/* Not wired: Scope and Result columns — the log records neither a campus nor a failed attempt; replaced by the fields changed and the request */}
        <DataTable
          columns={["Timestamp", "User", "Action", "Resource", "Changes", "Request"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          page={page}
          pages={full ? page + 1 : page}
          onPage={setPage}
          empty={list.loading ? "Loading the log…" : "No changes match these filters."}
        />
      </Panel>
    </>
  );
}

/** Page-head button: GET /audit-log.csv (up to the API's limit), downloaded with the session token. */
export function ExportAuditLog() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await download("/api/v1/school/audit-log.csv", "audit-log.csv");
        } catch (err) {
          notify(`Export failed: ${errorText(err)}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="download" className="sm" />
      {busy ? "Exporting…" : "Export log"}
    </button>
  );
}
