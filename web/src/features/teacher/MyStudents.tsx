"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Note } from "@/features/self/kit";
import { Student360 } from "./Student360";
import type { MyClasses, RosterStudent } from "./types";

type SectionOption = { id: number; label: string; roles: string[]; count: number; current: boolean };

/** Every section the teacher is in, as class teacher or subject teacher, with what they teach there. */
function sectionsOf(c: MyClasses | null): SectionOption[] {
  const m = new Map<number, SectionOption>();
  for (const s of c?.class_teacher_of ?? []) {
    m.set(s.section_id, { id: s.section_id, label: s.section_label, roles: ["Class teacher"], count: s.student_count, current: s.is_current_year });
  }
  for (const cs of c?.subject_teacher_of ?? []) {
    for (const s of cs.sections) {
      const o = m.get(s.section_id) ?? { id: s.section_id, label: `${cs.class_name} ${s.section_name}`, roles: [], count: s.student_count, current: cs.is_current_year };
      if (!o.roles.includes(cs.subject_name)) o.roles.push(cs.subject_name);
      m.set(s.section_id, o);
    }
  }
  return [...m.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.label.localeCompare(b.label));
}

/**
 * NEW-096, live: GET /teacher/my-classes for the sections the teacher is in,
 * GET /teacher/sections/{id}/students for a section's roster, and
 * GET /teacher/students/{id} (?id=) for one student's profile with
 * attendance, behaviour, exams, homework and parents.
 */
export function MyStudents() {
  const params = useSearchParams();
  const path = usePathname();
  const id = params.get("id");
  const section = params.get("section");
  return id ? <Student360 id={id} back={section ? `${path}?section=${section}` : path} /> : <Roster />;
}

function Roster() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const sections = useMemo(() => sectionsOf(classes.data), [classes.data]);
  const wanted = Number(params.get("section")) || null;
  const [sectionId, setSectionId] = useState<number | null>(wanted);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (sectionId === null && sections.length) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const roster = useApi<RosterStudent[]>(sectionId ? `/api/v1/teacher/sections/${sectionId}/students` : null);
  const all = useMemo(() => roster.data ?? [], [roster.data]);
  const q = search.trim().toLowerCase();
  const items = all.filter((s) => !q || `${s.full_name} ${s.admission_no}`.toLowerCase().includes(q));
  const section = sections.find((s) => s.id === sectionId);
  const c = classes.data;
  const ready = c !== null;
  const stats = [
    { label: "Sections", value: ready ? String(sections.length) : "…", note: "You teach or class-teach" },
    { label: "Students", value: ready ? String(sections.reduce((n, s) => n + s.count, 0)) : "…", note: "Across those sections" },
    { label: "Class teacher of", value: ready ? String(c.class_teacher_of.length) : "…", note: ready ? c.class_teacher_of.map((s) => s.section_label).join(", ") || "No class of your own" : "Loading" },
    { label: "Subjects", value: ready ? String(new Set(c.subject_teacher_of.map((s) => s.subject_id)).size) : "…", note: ready ? [...new Set(c.subject_teacher_of.map((s) => s.subject_name))].join(", ") || "None assigned" : "Loading" },
  ];

  const rows: Row[] = items.map((s) => [{ name: s.full_name, sub: s.admission_no }, String(s.roll_no), label(s.gender), date(s.dob)]);
  const open = (sid: number) => router.push(`${path}?id=${sid}${sectionId ? `&section=${sectionId}` : ""}`);

  if (c && !sections.length) return <Note>You are not assigned to any class yet. The school office assigns class teachers and subject teachers.</Note>;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or admission no…" aria-label="Search students" />
        </div>
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.label} · ${s.roles.join(", ")}${s.current ? "" : " (past year)"}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{classes.error ?? roster.error}</ErrorNote>
      <Panel title={section ? section.label : "Students"} sub={`${section ? section.roles.join(", ") : "Your class"}${roster.loading ? " · Loading…" : ` · ${all.length} active student(s)`}`} flush>
        <DataTable
          columns={["Student", "Roll no", "Gender", "Date of birth"]}
          rows={rows}
          selectable={false}
          onView={(i) => open(items[i].id)}
          empty={roster.loading || classes.loading ? "Loading…" : all.length ? "No student matches the search." : undefined}
          emptyState={{
            title: "No active students in this section",
            note: "Once students are enrolled in this section, their roster appears here.",
          }}
        />
      </Panel>
    </>
  );
}
