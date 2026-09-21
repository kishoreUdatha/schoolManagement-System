"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { FilterBar, PanelFooter } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type AuditAction = "create" | "update" | "delete";

type AuditEntry = {
  id: number;
  action: AuditAction;
  entity_type: string;
  entity_id: number | null;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  request_path: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

function actionTone(a: AuditAction) {
  if (a === "create") return "emerald" as const;
  if (a === "delete") return "rose" as const;
  return "amber" as const;
}

const KNOWN_ENTITIES = [
  "Student",
  "User",
  "Mark",
  "StudentAttendance",
  "Exam",
  "StudentFee",
  "ApprovalRequest",
  "Notice",
];

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"" | AuditAction>("");
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  async function load(e?: FormEvent) {
    e?.preventDefault();
    try {
      const params: Record<string, string> = {};
      if (action) params.action = action;
      if (entityType) params.entity_type = entityType;
      if (entityId) params.entity_id = entityId;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const { data } = await api.get<AuditEntry[]>(
        "/api/v1/school/audit-log",
        { params }
      );
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function downloadCsv() {
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (entityType) params.set("entity_type", entityType);
      if (entityId) params.set("entity_id", entityId);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const { data } = await api.get<string>(
        `/api/v1/school/audit-log.csv?${params}`,
        { responseType: "text" }
      );
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit_log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        subtitle="Who changed what, when. Tracks create / update / delete on critical entities."
        actions={
          <Button type="button" variant="secondary" onClick={downloadCsv}>
            Download CSV
          </Button>
        }
      />

      <form onSubmit={load}>
        <FilterBar>
          <select
            aria-label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className={filterSelect}
          >
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
          <select
            aria-label="Entity"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className={filterSelect}
          >
            <option value="">All entities</option>
            {KNOWN_ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
            ID
            <input
              type="number"
              aria-label="Entity ID"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className={`${filterSelect} w-24`}
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
            From
            <input
              type="date"
              aria-label="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={filterSelect}
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
            To
            <input
              type="date"
              aria-label="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={filterSelect}
            />
          </label>
          <Button type="submit">Apply</Button>
        </FilterBar>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              No entries match these filters.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Changes</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                Newest first. Open a row&rsquo;s diff to see the values before and
                after the change.
              </p>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">When</th>
                  <th className="px-4 py-3 font-bold">Action</th>
                  <th className="px-4 py-3 font-bold">Entity</th>
                  <th className="px-4 py-3 font-bold">By</th>
                  <th className="px-4 py-3 font-bold">Path</th>
                  <th className="px-4 py-3 font-bold">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {items.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="align-top hover:bg-surface-hover">
                      <td className="px-4 py-3 text-ink-muted">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">
                          {e.entity_type}
                        </span>
                        {e.entity_id != null && (
                          <span className="ml-1 text-[12px] tabular-nums text-ink-subtle">
                            #{e.entity_id}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        <div>{e.user_name ?? "—"}</div>
                        {e.user_role && (
                          <div className="text-[11px] text-ink-subtle">
                            {e.user_role}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-subtle">
                        {e.request_path ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded({
                              ...expanded,
                              [e.id]: !expanded[e.id],
                            })
                          }
                          className="rounded-md border border-surface-border px-2 py-0.5 text-xs text-ink-muted hover:text-ink"
                        >
                          {expanded[e.id] ? "Hide" : "Diff"}
                        </button>
                      </td>
                    </tr>
                    {expanded[e.id] && (
                      <tr>
                        <td colSpan={6} className="bg-surface-subtle/40 px-3 pb-3">
                          <DiffView old={e.old_values} next={e.new_values} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <PanelFooter
            left={`${items.length} entr${items.length === 1 ? "y" : "ies"} match these filters`}
            right={`${Object.values(expanded).filter(Boolean).length} diff(s) open`}
          />
        </Card>
      )}
    </div>
  );
}

function DiffView({
  old,
  next,
}: {
  old: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
}) {
  const keys = new Set<string>([
    ...Object.keys(old ?? {}),
    ...Object.keys(next ?? {}),
  ]);
  if (keys.size === 0) {
    return <p className="text-xs text-ink-subtle">No detailed payload.</p>;
  }
  return (
    <div className="space-y-1 text-xs">
      {Array.from(keys).map((k) => {
        const o = old?.[k];
        const n = next?.[k];
        return (
          <div key={k} className="grid grid-cols-[140px_1fr_1fr] gap-2">
            <span className="font-mono text-ink-subtle">{k}</span>
            <span className="font-mono text-danger">
              {o === undefined ? "—" : JSON.stringify(o)}
            </span>
            <span className="font-mono text-success">
              {n === undefined ? "—" : JSON.stringify(n)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
