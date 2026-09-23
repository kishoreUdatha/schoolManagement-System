"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import { relationsOf } from "./ParentShell";
import type { Parent } from "./types";

/** SCR-071, live: GET /api/v1/school/parents with status and search; class filter over the linked children. */
export function ParentDirectory() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const year = years.data?.find((y) => y.is_current) ?? years.data?.[0];
  const classes = useApi<SchoolClass[]>(year ? "/api/v1/school/classes" : null, { academic_year_id: year?.id });
  const list = useApi<Parent[]>("/api/v1/school/parents", { status, search });
  const everyone = useApi<Parent[]>("/api/v1/school/parents");

  // The API filters by status and search; the class filter is over the children each row already carries.
  const items = useMemo(() => {
    const all = list.data ?? [];
    if (!classId) return all;
    const sections = new Set(classes.data?.find((c) => String(c.id) === classId)?.sections.map((s) => s.id) ?? []);
    return all.filter((p) => p.children.some((c) => sections.has(c.section_id)));
  }, [list.data, classId, classes.data]);

  const rows: Row[] = items.map((p) => [
    { name: p.full_name, sub: p.email ?? "No email" },
    relationsOf(p),
    p.children.length ? p.children.map((c) => `${c.full_name.split(/\s+/)[0]} · ${c.section_label ?? "—"}`).join(", ") : "None linked",
    p.phone ?? "—",
    p.last_login_at ? `Signed in ${date(p.last_login_at)}` : "Never signed in",
    p.is_active ? "Active" : "Inactive",
  ]);

  const all = everyone.data;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const stats = [
    { label: "Parents & guardians", value: n(all?.length), note: "With a portal login" },
    { label: "Active logins", value: n(all?.filter((p) => p.is_active).length), note: "Can sign in today" },
    { label: "Children linked", value: n(all?.reduce((s, p) => s + p.children.length, 0)), note: "Across all parents" },
    { label: "Never signed in", value: n(all?.filter((p) => !p.last_login_at).length), note: "Worth a reminder" },
  ];

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
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error ?? everyone.error}</ErrorNote>
      <Panel title="All parents & guardians" sub={`Each login sees only its linked children${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Guardian", "Relationship", "Children", "Phone", "Portal access", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(73)}?id=${items[i].user_id}`)}
          empty={list.loading ? "Loading parents…" : search || status || classId ? "No parents match these filters." : undefined}
          emptyState={{
            title: "No parents yet",
            note: "Add a parent or guardian to give their family access to the portal.",
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
