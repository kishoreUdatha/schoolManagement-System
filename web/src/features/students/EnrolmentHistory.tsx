"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf, screen } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { StudentFrame } from "./StudentFrame";
import { OUTCOMES, type AcademicYear, type Enrollment, type Outcome, type RosterRow, type SchoolClass, type StudentProfile } from "./types";

const HERE = () => screen("NEW-012").route;

/**
 * NEW-012, live. Without ?id=: who was in which class in a year,
 * GET /api/v1/school/enrollments?academic_year_id&section_id. With ?id=:
 * one student's years, GET /school/students/{id}/enrollments, and
 * PATCH /school/enrollments/{id} {outcome} to correct a past year's result.
 */
export function EnrolmentHistory() {
  const id = useSearchParams().get("id");
  return id ? <OneStudent /> : <YearRoster />;
}

function YearRoster() {
  const router = useRouter();
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  useEffect(() => setSectionId(""), [yearId]);

  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const roster = useApi<RosterRow[]>(yearId ? "/api/v1/school/enrollments" : null, { academic_year_id: yearId, section_id: sectionId });

  const all = roster.data ?? [];
  const q = typed.trim().toLowerCase();
  const rows = useMemo(
    () => all.filter((r) => (!outcome || r.outcome === outcome) && (!q || r.full_name.toLowerCase().includes(q) || r.admission_no.toLowerCase().includes(q))),
    [all, outcome, q],
  );
  const count = (o: Outcome) => all.filter((r) => r.outcome === o).length;
  const year = years.data?.find((y) => y.id === yearId);

  const stats = [
    { label: "Enrolments", value: String(all.length), note: year ? `${year.name}${sectionId ? " · this section" : ""}` : "—" },
    { label: "Studying", value: String(count("studying")), note: "Year still open" },
    { label: "Promoted", value: String(count("promoted")), note: `${count("repeated")} repeated the year` },
    { label: "Left", value: String(count("left")), note: "Transferred or withdrawn" },
  ];

  const table: Row[] = rows.map((r) => [
    { name: r.full_name, sub: r.admission_no },
    r.section_label ?? "—",
    String(r.roll_no),
    date(r.start_date),
    r.end_date ? date(r.end_date) : "—",
    label(r.outcome),
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name or admission number…" aria-label="Search students" />
        </div>
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
        <select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">All sections</option>
          {classes.data?.map((c) =>
            c.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {`${c.name} ${s.name}`}
              </option>
            )),
          )}
        </select>
        <select aria-label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">Any outcome</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {label(o)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{years.error ?? classes.error ?? roster.error}</ErrorNote>
      <Panel title="Year roster" sub={`${year ? `Who was enrolled in ${year.name}` : "Choose a year"}${roster.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Section", "Roll no.", "Joined", "Ended", "Outcome"]}
          rows={table}
          selectable={false}
          onView={(i) => router.push(`${HERE()}?id=${rows[i].student_id}`)}
          empty={roster.loading ? "Loading enrolments…" : q || outcome || sectionId ? "No enrolments match these filters." : undefined}
          emptyState={{
            title: "No enrolments yet",
            note: year ? `No students have been enrolled in ${year.name} yet.` : "Choose an academic year to see who was enrolled.",
          }}
        />
      </Panel>
      <div className="gap" />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Open a student to see every year they were enrolled and to correct a past year&apos;s outcome. Promotions themselves are made on the Promotion / Transfer screen.</span>
      </div>
    </>
  );
}

function OneStudent() {
  return <StudentFrame active={0}>{(s) => <History s={s} />}</StudentFrame>;
}

function History({ s }: { s: StudentProfile }) {
  const list = useApi<Enrollment[]>(`/api/v1/school/students/${s.id}/enrollments`);
  const [editing, setEditing] = useState<Enrollment | null>(null);
  const [value, setValue] = useState<Outcome>("studying");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(e: Enrollment) {
    setEditing(e);
    setValue(e.outcome);
    setError(null);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch<Enrollment>(`/api/v1/school/enrollments/${editing.id}`, { outcome: value });
      notify(`${editing.academic_year_name} marked ${label(value).toLowerCase()}.`);
      setEditing(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const items = list.data ?? [];
  const table: Row[] = items.map((e) => [
    e.academic_year_name,
    e.section_label ?? "—",
    String(e.roll_no),
    date(e.start_date),
    e.end_date ? date(e.end_date) : "Current",
    label(e.outcome),
    e.notes ?? "—",
  ]);
  const current = editing ? editing.end_date === null : false;

  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <Link href={HERE()} className="btn">
          <Icon name="arrow" className="sm" />
          Back to the year roster
        </Link>
        <Link href={`${routeOf(69)}?id=${s.id}`} className="btn">
          Promotion / transfer
        </Link>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Enrolment history" sub={`${items.length} year(s) on record${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Academic year", "Section", "Roll no.", "Joined", "Ended", "Outcome", "Description"]}
          rows={table}
          selectable={false}
          actions={(i) => (
            <button type="button" className="btn" onClick={() => open(items[i])}>
              Correct outcome
            </button>
          )}
          empty={list.loading ? "Loading…" : undefined}
          emptyState={{
            title: "No enrolment history yet",
            note: "Years will appear here once this student is enrolled in an academic year.",
          }}
        />
      </Panel>

      <Dialog
        open={editing !== null}
        title="Correct the outcome"
        onClose={() => setEditing(null)}
        onSubmit={save}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || value === editing?.outcome}>
              {saving ? "Saving…" : "Save outcome"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <p className="muted small" style={{ marginBottom: 12 }}>
          {editing ? `${s.full_name} · ${editing.academic_year_name} · ${editing.section_label ?? "—"}` : ""}
        </p>
        <div className="form-grid">
          <label className="field full">
            <span>Outcome</span>
            <select value={value} onChange={(e) => setValue(e.target.value as Outcome)}>
              {OUTCOMES.map((o) => (
                <option key={o} value={o} disabled={current && o !== "studying"}>
                  {label(o)}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {current
                ? "This year is still in progress, so it can only be Studying. Promote or transfer the student to close it."
                : "This only corrects the record of how the year ended; it does not move the student."}
            </span>
          </label>
        </div>
      </Dialog>
    </>
  );
}
