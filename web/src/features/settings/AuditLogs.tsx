"use client";

import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
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

type Filters = { action: string; entity_type: string; from: string; to: string; result: string };

/** Why a refused attempt was refused, from the status the log keeps. */
function refusal(e: AuditEntry): string | undefined {
  const v = e.new_values ?? {};
  const detail = typeof v.detail === "string" ? v.detail : undefined;
  return [v.status ? `HTTP ${v.status}` : null, detail].filter(Boolean).join(" · ") || undefined;
}

/** What changed, by field name, from the old and new values the log keeps. */
function changed(e: AuditEntry): string {
  const keys = new Set([...Object.keys(e.old_values ?? {}), ...Object.keys(e.new_values ?? {})]);
  const list = [...keys].filter((k) => k !== "id" && k !== "updated_at");
  if (!list.length) return "—";
  return list.length > 3 ? `${list.slice(0, 3).map(label).join(", ")} +${list.length - 3}` : list.map(label).join(", ");
}

/**
 * SCR-294, live: GET /audit-log with action, result, record type and date filters,
 * fifty at a time (limit/offset; the API returns no total). "Export log"
 * downloads GET /audit-log.csv with the same filters.
 */
export function AuditLogs() {
  const [typed, setTyped] = useState("");
  const [f, setF] = useState<Filters>({ action: "", entity_type: "", from: "", to: "", result: "" });
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, entity_type: typed.trim() })), 400);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [f]);

  const list = useApi<AuditEntry[]>("/api/v1/school/audit-log", { ...f, limit: LIMIT, offset: (page - 1) * LIMIT });
  const items = list.data ?? [];
  const full = items.length === LIMIT;

  // The API returns no total, so the figures describe the page shown.
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Entries", value: n(items.length), note: full ? `Page ${page}; more on the next` : `Page ${page}` },
    { label: "Failed attempts", value: n(items.filter((e) => e.result === "failed").length), note: "Refused, on this page" },
    { label: "Deletions", value: n(items.filter((e) => e.action === "delete").length), note: "Records deleted, on this page" },
    { label: "People", value: n(new Set(items.map((e) => e.user_id).filter((x) => x !== null)).size), note: "Who made these changes" },
  ];

  const rows: Row[] = items.map((e) => [
    dateTime(e.created_at),
    { name: e.user_name ?? "System", sub: e.user_role ? label(e.user_role) : (e.user_email ?? undefined) },
    ACTION[e.action] ?? label(e.action),
    `${e.entity_type}${e.entity_id ? ` #${e.entity_id}` : ""}`,
    e.scope ?? "—",
    e.result === "failed" ? { name: "Failed", sub: refusal(e) } : "Success",
    e.result === "failed" ? (e.request_path ?? "—") : changed(e),
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
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
        <select aria-label="Filter by result" value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })}>
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="failed">Failed attempts</option>
        </select>
        <input type="date" aria-label="From date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <input type="date" aria-label="To date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Activity log" sub={`Latest changes first · ${items.length} on this page${list.loading ? " · Loading…" : ""}`} action={<span className="badge">Read only</span>} flush>
        <DataTable
          columns={["Timestamp", "User", "Action", "Resource", "Scope", "Result", "Changes"]}
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
