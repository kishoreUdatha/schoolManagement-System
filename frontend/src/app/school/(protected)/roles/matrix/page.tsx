"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Minus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Permission = {
  code: string;
  module: string;
  name: string;
  description: string | null;
};
type Role = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  base_role: string;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
  users: number;
};

/** Who can do what, all roles at once.
 *
 *  The per-role editor answers "what may this role do". It cannot answer the
 *  two questions a school actually asks — who can do this one thing, and how
 *  do these two roles differ — because both need every role side by side.
 *
 *  Cells are editable because PUT /roles/{id} already replaces a role's
 *  permission set; a built-in role keeps its code and portal but its
 *  permissions move like any other.
 */
export default function PermissionMatrixPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [filter, setFilter] = useState("");
  const [differingOnly, setDifferingOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Permission[]>("/api/v1/school/permissions")
      .then((r) => setPermissions(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Role[]>("/api/v1/school/roles")
      .then((r) => setRoles(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const active = useMemo(() => roles.filter((r) => r.is_active), [roles]);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return permissions.filter((p) => {
      if (
        needle &&
        !`${p.name} ${p.code} ${p.module} ${p.description ?? ""}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      if (differingOnly && active.length > 1) {
        const first = active[0].permissions.includes(p.code);
        return active.some((r) => r.permissions.includes(p.code) !== first);
      }
      return true;
    });
  }, [permissions, filter, differingOnly, active]);

  // Grouped by module so the left column reads as a list of jobs rather than
  // an alphabetical run of codes.
  const grouped = useMemo(() => {
    const by = new Map<string, Permission[]>();
    rows.forEach((p) => {
      const list = by.get(p.module) ?? [];
      list.push(p);
      by.set(p.module, list);
    });
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const toggle = async (role: Role, code: string) => {
    const has = role.permissions.includes(code);
    const next = has
      ? role.permissions.filter((c) => c !== code)
      : [...role.permissions, code];
    const before = roles;

    setSaving(`${role.id}:${code}`);
    setError(null);
    setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, permissions: next } : r)));
    try {
      // PUT replaces the whole role, so its own values go back unchanged and
      // only the permission list moves.
      await api.put(`/api/v1/school/roles/${role.id}`, {
        name: role.name,
        code: role.code,
        description: role.description,
        base_role: role.base_role,
        is_active: role.is_active,
        permissions: next,
      });
    } catch (e) {
      setRoles(before);
      setError(apiError(e));
    } finally {
      setSaving(null);
    }
  };

  const differing = useMemo(() => {
    if (active.length < 2) return 0;
    return permissions.filter((p) => {
      const first = active[0].permissions.includes(p.code);
      return active.some((r) => r.permissions.includes(p.code) !== first);
    }).length;
  }, [permissions, active]);

  return (
    <div className="space-y-6">
      <Link
        href="/school/roles"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Roles and branches
      </Link>

      <PageHeader
        title="Permission matrix"
        subtitle="Every role side by side. Tick a cell to grant, untick to take away — it saves as you go."
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Permissions" value={permissions.length} />
        <StatCard label="Active roles" value={active.length} />
        <StatCard
          label="Roles differ on"
          value={differing}
          hint={active.length < 2 ? "Needs two roles to compare" : undefined}
        />
        <StatCard label="Showing" value={rows.length} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Find a permission"
          placeholder="marks, fees, attendance…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-[240px]"
        />
        <label className="flex items-center gap-2 pb-2 text-[13px] text-ink-muted">
          <input
            type="checkbox"
            checked={differingOnly}
            onChange={(e) => setDifferingOnly(e.target.checked)}
            disabled={active.length < 2}
          />
          Only where roles disagree
        </label>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-[260px] border-b border-r border-surface-border bg-surface-subtle px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                    Permission
                  </th>
                  {active.map((r) => (
                    <th
                      key={r.id}
                      className="sticky top-0 z-20 min-w-[112px] border-b border-surface-border bg-surface-subtle px-3 py-3 text-center align-bottom"
                    >
                      <span className="block text-[12px] font-extrabold text-ink">{r.name}</span>
                      <span className="mt-1 block">
                        {r.is_system ? (
                          <Badge tone="brand">Built-in</Badge>
                        ) : (
                          <Badge tone="neutral">Custom</Badge>
                        )}
                      </span>
                      <span className="mt-1 block text-[10px] font-normal text-ink-subtle">
                        {r.users} {r.users === 1 ? "person" : "people"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(([module, perms]) => (
                  <Fragment key={module}>
                    <tr>
                      <td
                        colSpan={active.length + 1}
                        className="sticky left-0 z-10 border-b border-surface-border bg-surface px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted"
                      >
                        {module}
                      </td>
                    </tr>
                    {perms.map((p) => (
                      <tr key={p.code}>
                        <td className="sticky left-0 z-10 border-b border-r border-surface-border bg-surface-raised px-4 py-2.5">
                          <span className="font-bold text-ink">{p.name}</span>
                          {p.description && (
                            <span className="block text-[11px] font-normal text-ink-subtle">
                              {p.description}
                            </span>
                          )}
                        </td>
                        {active.map((r) => {
                          const granted = r.permissions.includes(p.code);
                          const busy = saving === `${r.id}:${p.code}`;
                          return (
                            <td
                              key={r.id}
                              className="border-b border-surface-border bg-surface-raised px-3 py-2.5 text-center"
                            >
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => toggle(r, p.code)}
                                aria-label={`${granted ? "Take away" : "Grant"} ${p.name} for ${r.name}`}
                                className={
                                  granted
                                    ? "inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-success-bg text-success hover:opacity-80 disabled:opacity-40"
                                    : "inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-surface-subtle text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
                                }
                              >
                                {granted ? (
                                  <Check className="h-4 w-4" strokeWidth={3} />
                                ) : (
                                  <Minus className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={active.length + 1}
                      className="px-4 py-10 text-center text-ink-muted"
                    >
                      {differingOnly
                        ? "Every role agrees on the permissions matching that search."
                        : "No permission matches that search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        A built-in role keeps its code and the portal it signs into; only its permissions
        move. Inactive roles are left out of the matrix — edit those from{" "}
        <Link href="/school/roles" className="font-bold text-brand-600 hover:underline">
          roles and branches
        </Link>
        .
      </p>
    </div>
  );
}
