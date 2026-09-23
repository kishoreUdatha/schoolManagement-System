"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import type { GuardianRow } from "./types";

/**
 * SCR-071, live: GET /api/v1/school/guardians — every family contact the
 * school holds, whether or not they can sign in. A parent added with a child
 * (or brought in by the bulk import) is a contact from the start; the portal
 * login is a separate step, offered here for anyone with an email address
 * (POST /students/{child}/guardians/{id}/portal-access).
 */
export function ParentDirectory() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [access, setAccess] = useState("");
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [made, setMade] = useState<{ who: string; email: string; password: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const year = years.data?.find((y) => y.is_current) ?? years.data?.[0];
  const classes = useApi<SchoolClass[]>(year ? "/api/v1/school/classes" : null, { academic_year_id: year?.id });
  const list = useApi<GuardianRow[]>("/api/v1/school/guardians", { search, has_login: access });
  const everyone = useApi<GuardianRow[]>("/api/v1/school/guardians");

  // The API filters by name and by whether they can sign in; the class filter
  // is over the children each row already carries.
  const items = useMemo(() => {
    const all = list.data ?? [];
    if (!classId) return all;
    const name = classes.data?.find((c) => String(c.id) === classId)?.name;
    return all.filter((g) => g.children.some((c) => (c.section_label ?? "").startsWith(`${name} `)));
  }, [list.data, classId, classes.data]);

  const rows: Row[] = items.map((g) => [
    { name: g.full_name, sub: g.email ?? g.phone ?? "No email or phone" },
    [...new Set(g.children.map((c) => label(c.relation)))].join(" / ") || "—",
    g.children.length ? g.children.map((c) => `${c.full_name.split(/\s+/)[0]} · ${c.section_label ?? "—"}`).join(", ") : "No child linked",
    g.phone ?? "—",
    !g.has_portal_login ? "No login" : g.last_login_at ? `Signed in ${date(g.last_login_at)}` : "Never signed in",
    !g.has_portal_login ? "Contact only" : g.is_active ? "Active" : "Inactive",
  ]);

  const all = everyone.data;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const withLogin = all?.filter((g) => g.has_portal_login).length;
  const stats = [
    { label: "Parents & guardians", value: n(all?.length), note: "Everyone the school can ring" },
    { label: "With a login", value: n(withLogin), note: all?.length ? `${all.length - (withLogin ?? 0)} without one` : "Portal access" },
    { label: "Children linked", value: n(all?.reduce((s, g) => s + g.children.length, 0)), note: "Across all families" },
    { label: "Never signed in", value: n(all?.filter((g) => g.has_portal_login && !g.last_login_at).length), note: "Worth a reminder" },
  ];

  /** Give this contact the parent portal, through the first child they are on. */
  async function giveLogin(g: GuardianRow) {
    const child = g.children[0];
    if (!child) {
      notify(`${g.full_name} is not linked to a child yet.`);
      return;
    }
    if (!(await ask(`Create a portal login for ${g.full_name}? They will see ${g.children.map((c) => c.full_name).join(", ")}.`))) return;
    setBusy(g.guardian_id);
    setFailed(null);
    try {
      const r = await api.post<{ email: string; temporary_password: string }>(
        `/api/v1/school/students/${child.student_id}/guardians/${g.guardian_id}/portal-access`,
      );
      setMade({ who: g.full_name, email: r.email, password: r.temporary_password });
      list.reload();
      everyone.reload();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, email or phone…" aria-label="Search parents" />
        </div>
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by portal access" value={access} onChange={(e) => setAccess(e.target.value)}>
          <option value="">Everyone</option>
          <option value="true">Has a login</option>
          <option value="false">No login yet</option>
        </select>
      </div>
      <ErrorNote>{failed ?? list.error ?? everyone.error}</ErrorNote>
      {made ? (
        <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="shield" className="sm" />
          <span>
            {`${made.who} signs in with ${made.email}. Temporary password `}
            <b className="mono">{made.password}</b>
            {". It is shown only once — pass it on before leaving this page. "}
            <button type="button" className="btn" onClick={() => setMade(null)}>
              Done
            </button>
          </span>
        </div>
      ) : null}
      <Panel
        title="All parents & guardians"
        sub={`Anyone on a child's record, login or not. A login sees only its own children${list.loading ? " · Loading…" : ""}`}
        flush
      >
        <DataTable
          columns={["Guardian", "Relationship", "Children", "Phone", "Portal access", "Status"]}
          rows={rows}
          actions={(i) => {
            const g = items[i];
            return g.has_portal_login ? (
              <button type="button" className="btn" onClick={() => router.push(`${routeOf(73)}?id=${g.user_id}`)}>
                View
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy === g.guardian_id || !g.email || !g.children.length}
                title={!g.email ? "Add their email address first — it is their sign-in" : !g.children.length ? "Link them to a child first" : "Create their portal login"}
                onClick={() => giveLogin(g)}
              >
                {busy === g.guardian_id ? "Working…" : "Give a login"}
              </button>
            );
          }}
          empty={list.loading ? "Loading parents…" : search || access || classId ? "No parents match these filters." : undefined}
          emptyState={{
            title: "No parents yet",
            note: "A parent is added with their child, on the Add student form or in the bulk import.",
            action: (
              <Link href="/parents/add-parent-guardian" className="btn primary">
                <Icon name="plus" className="sm" />
                Add guardian
              </Link>
            ),
          }}
        />
      </Panel>
    </>
  );
}
