"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, CircleCheck, CircleSlash, Clock } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Parent = {
  user_id: number;
  full_name: string;
  is_active: boolean;
  last_login_at: string | null;
  children: { student_id: number; full_name: string }[];
};

type Entry = {
  id: number;
  action: "create" | "update" | "delete";
  entity_type: string;
  entity_id: number | null;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  request_path: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

function ParentTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/school/parents/${id}`;
  const tabs = [
    { href: base, label: "Profile" },
    { href: `${base}/payments`, label: "Payments" },
    { href: `${base}/activity`, label: "Activity" },
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-surface-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            pathname === t.href
              ? "border-b-2 border-brand-600 px-3 py-2 text-[13px] font-extrabold text-brand-600"
              : "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-ink-muted hover:text-ink"
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const ACTION_TONE = { create: "emerald", update: "amber", delete: "rose" } as const;

/** Summarise a row without dumping JSON at somebody.
 *  The audit table stores whole value maps; naming the fields that moved is
 *  what a person actually wants to know. */
function changed(e: Entry): string {
  if (e.action === "create") return "Record created";
  if (e.action === "delete") return "Record removed";
  const before = e.old_values ?? {};
  const after = e.new_values ?? {};
  const keys = Object.keys(after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  if (keys.length === 0) return "Updated";
  return `Changed ${keys.slice(0, 4).map((k) => k.replace(/_/g, " ")).join(", ")}${
    keys.length > 4 ? ` and ${keys.length - 4} more` : ""
  }`;
}

/** What a parent has done, and what has been done to their account.
 *
 *  Two different questions, so two different filters against the audit log:
 *  entries where this parent was the actor, and entries where their user
 *  record was the thing acted on. Lumping them together would read as though
 *  the office's edits were the parent's own.
 */
export default function ParentActivityPage() {
  const { id } = useParams<{ id: string }>();
  const [parent, setParent] = useState<Parent | null>(null);
  const [byThem, setByThem] = useState<Entry[]>([]);
  const [toThem, setToThem] = useState<Entry[]>([]);
  const [view, setView] = useState<"by" | "to">("by");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, mine, about] = await Promise.all([
        api.get<Parent>(`/api/v1/school/parents/${id}`),
        api.get<Entry[]>("/api/v1/school/audit-log", {
          params: { user_id: id, limit: 200 },
        }),
        api.get<Entry[]>("/api/v1/school/audit-log", {
          params: { entity_type: "user", entity_id: id, limit: 200 },
        }),
      ]);
      setParent(p.data);
      setByThem(mine.data);
      setToThem(about.data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = view === "by" ? byThem : toThem;

  return (
    <div className="space-y-6">
      <Link
        href="/school/parents"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All parents
      </Link>

      <PageHeader
        title={parent ? `${parent.full_name} — activity` : "Activity"}
        subtitle="When this parent last signed in, what they have changed, and what the office has changed about them."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Show"
              value={view}
              onChange={(e) => setView(e.target.value as "by" | "to")}
            >
              <option value="by">Things this parent did</option>
              <option value="to">Changes to this parent&apos;s account</option>
            </Select>
            <Button variant="secondary" onClick={load} loading={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      <ParentTabs id={id} />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Last signed in"
          value={parent?.last_login_at ? dateTime(parent.last_login_at) : "Never"}
          accent={parent?.last_login_at ? "brand" : "amber"}
          icon={Clock}
        />
        <StatCard
          label="Account"
          value={parent ? (parent.is_active ? "Active" : "Cannot sign in") : "—"}
          accent={parent?.is_active ? "emerald" : "rose"}
          icon={parent?.is_active ? CircleCheck : CircleSlash}
        />
        <StatCard label="Things they did" value={byThem.length} />
        <StatCard label="Changes to the account" value={toThem.length} />
      </div>

      {!loading && byThem.length === 0 && view === "by" && (
        <NoticeBox>
          Nothing recorded. A parent only leaves an entry here when they change
          something — paying online, answering a consent, handing work in on a
          child&apos;s behalf. Signing in and reading are not recorded, so a quiet
          list does not mean an unused account. The last sign-in above is the better
          sign of that.
        </NoticeBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {view === "by" ? "What they did" : "What was changed about them"}
          </CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">
            {rows.length} entr{rows.length === 1 ? "y" : "ies"}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["When", "What", "Record", "Detail", view === "to" ? "By" : ""]}
            empty={
              rows.length === 0 &&
              (loading
                ? "Loading…"
                : view === "by"
                  ? "Nothing recorded for this parent."
                  : "Nobody has changed this account.")
            }
          >
            {rows.map((e) => (
              <tr key={e.id}>
                <td className={td}>{dateTime(e.created_at)}</td>
                <td className={td}>
                  <Badge tone={ACTION_TONE[e.action]}>{humanize(e.action)}</Badge>
                </td>
                <td className={tdStrong}>
                  {humanize(e.entity_type)}
                  {e.entity_id && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      #{e.entity_id}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {changed(e)}
                  {e.request_path && (
                    <span className="block font-mono text-[11px] text-ink-subtle">
                      {e.request_path}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {view === "to"
                    ? e.user_name
                      ? `${e.user_name}${e.user_role ? ` (${humanize(e.user_role)})` : ""}`
                      : "—"
                    : ""}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
