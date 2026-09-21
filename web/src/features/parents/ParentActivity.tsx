"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { dateTime } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { AuditItem, PICK_PARENT, useParent } from "./ParentShell";
import type { AuditEntry } from "./types";

/**
 * SCR-079, live: GET /parents/{id}, and two questions put to GET /audit-log —
 * what this parent did (user_id=) and what was done to their account
 * (entity_type=User&entity_id=). Kept apart so office edits never read as the parent's own.
 */
export function ParentActivity() {
  const { id, data: p, error, loading } = useParent();
  const [view, setView] = useState<"by" | "to">("by");
  const byThem = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { user_id: id, limit: 200 });
  const toThem = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { entity_type: "User", entity_id: id, limit: 200 });

  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  const list = view === "by" ? byThem : toThem;
  const entries = list.data ?? [];

  return (
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
          <p className="muted small">Review the latest activity; portal access and passwords are managed on Login access.</p>
          <div className="gap" />
          {/* Not wired: "Add note" — there is no endpoint for a school-side note on a parent. */}
          <Link href={`${routeOf(76)}?id=${p.user_id}`} className="btn">
            <Icon name="arrow" className="sm" />
            Login access
          </Link>
        </Panel>
      </aside>
    </div>
  );
}
