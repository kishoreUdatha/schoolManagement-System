"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api } from "@/lib/api";
import { dateTime, money, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { StudentProfile } from "@/features/students/types";
import { AuditItem, ParentBanner, PICK_PARENT, relationsOf, useParent } from "./ParentShell";
import type { AuditEntry, Parent } from "./types";

/** Each linked child's profile, for attendance and fees at a glance. */
export function useChildren(p: Parent | null) {
  const [kids, setKids] = useState<StudentProfile[] | null>(null);
  const key = p?.children.map((c) => c.student_id).join(",") ?? "";
  useEffect(() => {
    if (!p) return;
    let live = true;
    Promise.all(p.children.map((c) => api.get<StudentProfile>(`/api/v1/school/students/${c.student_id}`).catch(() => null))).then((r) => {
      if (live) setKids(r.filter((x): x is StudentProfile => x !== null));
    });
    return () => {
      live = false;
    };
    // key captures the children
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return kids;
}

const kv = (rows: [string, string][]) => (
  <dl className="kv">
    {rows.map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </div>
    ))}
  </dl>
);

/** SCR-073, live: GET /parents/{id}, each child's /students/{id}, and /audit-log for the account. */
export function ParentProfile() {
  const { id, data: p, error, loading } = useParent();
  const kids = useChildren(p);
  const activity = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { entity_type: "User", entity_id: id, limit: 5 });
  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  const feesPending = kids?.reduce((s, k) => s + Number(k.fees_pending_amount ?? 0), 0);

  return (
    <>
      <ParentBanner p={p} active={73} />
      <div className="two-col">
        <div className="stack">
          <Panel title="Personal information">
            {/* Not wired: occupation and address — a parent login (ParentRead) carries neither. */}
            {kv([
              ["Guardian name", p.full_name],
              ["Relationship", relationsOf(p)],
              ["Phone", p.phone ?? "—"],
              ["Email address", p.email ?? "—"],
            ])}
          </Panel>
          <Panel title="Contact information">
            {kv([
              ["Email address", p.email ?? "—"],
              ["Mobile number", p.phone ?? "—"],
              ["Last sign-in", p.last_login_at ? dateTime(p.last_login_at) : "Never"],
              ["Portal status", p.is_active ? "Active" : "Inactive"],
            ])}
          </Panel>
          <Panel title="Linked children" sub={`${p.children.length} linked`}>
            {p.children.length ? (
              kv(p.children.map((c) => [c.full_name, `${c.section_label ?? "—"} · ${c.admission_no} · ${c.relation}`]))
            ) : (
              <p className="muted">No children linked yet.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              {kids === null ? (
                <p className="muted">Loading…</p>
              ) : (
                <>
                  {kids.map((k) => (
                    <div className="progress-label" key={k.id}>
                      <span>{`${k.full_name.split(/\s+/)[0]} · attendance`}</span>
                      <strong>{pct(k.attendance.attendance_percent)}</strong>
                    </div>
                  ))}
                  <div className="progress-label">
                    <span>Fees pending</span>
                    <strong>{money(feesPending)}</strong>
                  </div>
                  <div className="progress-label">
                    <span>Homework set recently</span>
                    <strong>{kids.reduce((s, k) => s + k.homework_recent.length, 0)}</strong>
                  </div>
                </>
              )}
            </div>
          </Panel>
          <Panel title="Recent activity">
            {activity.data?.length ? (
              activity.data.map((e) => <AuditItem key={e.id} e={e} />)
            ) : (
              <p className="muted">{activity.loading ? "Loading…" : activity.error ?? "Nothing recorded on this account yet."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
