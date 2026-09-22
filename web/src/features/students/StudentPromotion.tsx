"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel, Person } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText, type Paginated } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { SectionResults } from "./records";
import type { AcademicYear, SchoolClass, Student } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-069, live: pick a section in one year and a section in the next, review
 * the active roster, then POST /students/promote {source_section_id,
 * target_section_id, student_ids}. A section change inside a year is an edit
 * of the student (SCR-058). Each child's result across the year's published
 * exams from GET /student-detail/section-results?section_id=.
 */
export function StudentPromotion() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [fromYear, setFromYear] = useState<number | null>(null);
  const [toYear, setToYear] = useState<number | null>(null);
  const [fromClass, setFromClass] = useState<number | null>(null);
  const [fromSection, setFromSection] = useState<number | null>(null);
  const [toClass, setToClass] = useState<number | null>(null);
  const [toSection, setToSection] = useState<number | null>(null);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current year to the year after it, when there is one.
  useEffect(() => {
    const ys = years.data;
    if (fromYear !== null || !ys?.length) return;
    const cur = ys.find((y) => y.is_current) ?? ys[0];
    setFromYear(cur.id);
    const later = ys.filter((y) => y.start_date > cur.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    setToYear((later ?? ys.find((y) => y.id !== cur.id))?.id ?? null);
  }, [years.data, fromYear]);

  const srcClasses = useApi<SchoolClass[]>(fromYear ? "/api/v1/school/classes" : null, { academic_year_id: fromYear });
  const tgtClasses = useApi<SchoolClass[]>(toYear ? "/api/v1/school/classes" : null, { academic_year_id: toYear });
  const roster = useApi<Paginated<Student>>(fromSection && fromYear ? "/api/v1/school/students" : null, {
    academic_year_id: fromYear,
    section_id: fromSection,
    status: "active",
    page_size: 200,
  });
  const results = useApi<SectionResults>(fromSection ? "/api/v1/school/student-detail/section-results" : null, { section_id: fromSection });
  const resultOf = new Map((results.data?.students ?? []).map((r) => [r.student_id, r]));
  const resultText = (id: number) => {
    const r = resultOf.get(id);
    if (!r) return results.loading ? "…" : "—";
    if (r.result === "no_marks") return "No marks";
    return `${r.result === "pass" ? "Pass" : `Fail (${r.papers_failed} paper${r.papers_failed === 1 ? "" : "s"})`}${r.percent !== null ? ` · ${r.percent}%` : ""}`;
  };
  useEffect(() => setHeld(new Set()), [fromSection]);

  const srcClass = srcClasses.data?.find((c) => c.id === fromClass);
  const tgtClass = tgtClasses.data?.find((c) => c.id === toClass);
  const srcSection = srcClass?.sections.find((x) => x.id === fromSection);
  const tgtSection = tgtClass?.sections.find((x) => x.id === toSection);

  // Suggest the next class by display order once a source class is chosen.
  useEffect(() => {
    if (!srcClass || !tgtClasses.data || toClass) return;
    const next = [...tgtClasses.data].sort((a, b) => a.display_order - b.display_order).find((c) => c.display_order > srcClass.display_order);
    if (next) setToClass(next.id);
  }, [srcClass, tgtClasses.data, toClass]);

  const students = useMemo(() => roster.data?.items ?? [], [roster.data]);
  const moving = students.filter((s) => !held.has(s.id));
  // The chosen section's figures; nothing to count until one is picked.
  const n = (v: number, loading = roster.loading && !roster.data) => (!fromSection ? "—" : loading ? "…" : String(v));
  const outcome = results.data?.students ?? [];
  const stats = [
    { label: "Students", value: n(students.length), note: fromSection ? `Active in ${srcClass?.name ?? ""} ${srcSection?.name ?? ""}`.trim() : "Choose a section" },
    { label: "To promote", value: n(moving.length), note: tgtClass ? `Into ${tgtClass.name}${tgtSection ? ` ${tgtSection.name}` : ""}` : "Choose the next class" },
    { label: "Held back", value: n(held.size), note: "Unticked in the list" },
    { label: "Failed", value: n(outcome.filter((r) => r.result === "fail").length, results.loading && !results.data), note: `${outcome.filter((r) => r.result === "no_marks").length} with no marks yet` },
  ];
  const yearName = (id: number | null) => years.data?.find((y) => y.id === id)?.name ?? "—";

  function toggle(id: number) {
    setHeld((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function promote() {
    if (!fromSection || !toSection) return setError("Choose the section students leave and the section they join.");
    if (fromYear === toYear) return setError("Promote into a different academic year.");
    if (!moving.length) return setError("Choose at least one student to promote.");
    const n = moving.length;
    if (!(await ask(`Promote ${n} student${n === 1 ? "" : "s"} to the new section? They move out of this section${held.size ? `; ${held.size} held back stay` : ""}.`))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ promoted: unknown[] }>("/api/v1/school/students/promote", {
        source_section_id: fromSection,
        target_section_id: toSection,
        student_ids: held.size ? moving.map((s) => s.id) : null,
      });
      notify(`${res.promoted?.length ?? moving.length} students promoted.`);
      // Those held back are all that is left in the section; start them unticked.
      setHeld(new Set());
      roster.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Promotion needs next year's classes. When the school has no other year,
  // offer to create it: same classes and sections, dates a year on, not current.
  const from = years.data?.find((y) => y.id === fromYear) ?? null;
  const noNextYear = Boolean(years.data && fromYear && !years.data.some((y) => y.id !== fromYear));
  const plusYear = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  const nextName = from
    ? from.name.replace(/(\d{4})(\D+)(\d{2,4})/, (_m, a: string, sep: string, b: string) => `${Number(a) + 1}${sep}${String(Number(b) + 1).padStart(b.length, "0")}`)
    : "";
  async function createNextYear() {
    if (!from || !srcClasses.data) return;
    const cls = srcClasses.data;
    if (!(await ask(`Create ${nextName} (${plusYear(from.start_date)} to ${plusYear(from.end_date)}) with the same ${cls.length} classes and their sections? It will not become the current year until you switch to it.`, { confirmLabel: `Create ${nextName}` })))
      return;
    setBusy(true);
    setError(null);
    try {
      const y = await api.post<{ id: number }>("/api/v1/school/academic-years", { name: nextName, start_date: plusYear(from.start_date), end_date: plusYear(from.end_date), is_current: false });
      for (const c of cls) {
        const made = await api.post<{ id: number }>("/api/v1/school/classes", { academic_year_id: y.id, name: c.name, display_order: c.display_order, code: c.code, school_level: c.school_level });
        for (const x of c.sections) await api.post(`/api/v1/school/classes/${made.id}/sections`, { name: x.name, capacity: x.capacity });
      }
      notify(`${nextName} created with ${cls.length} classes. Add its terms under Academic years when you're ready.`);
      years.reload();
      setToYear(y.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const pickYear = (value: number | null, set: (v: number) => void, reset: () => void, aria: string, exclude?: number | null) => (
    <select
      aria-label={aria}
      value={value ?? ""}
      onChange={(e) => {
        set(Number(e.target.value));
        reset();
      }}
    >
      {value === null ? <option value="">{years.data?.some((y) => y.id !== exclude) ? "Choose year…" : "No next year yet"}</option> : null}
      {years.data
        ?.filter((y) => y.id !== exclude)
        .map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
          </option>
        ))}
    </select>
  );

  return (
    <>
      <StatStrip items={stats} compact />
      {noNextYear ? (
        <div className="tip warn" style={{ marginBottom: 14, alignItems: "center" }}>
          <Icon name="calendar" className="sm" />
          <span style={{ flex: 1 }}>{`Students are promoted into next academic year, and ${from?.name ?? "this year"} is the only one so far. Create ${nextName} first; its classes and sections are copied from this year.`}</span>
          <button type="button" className="btn primary sm" disabled={busy || !srcClasses.data} onClick={createNextYear}>
            <Icon name="plus" className="sm" />
            {busy ? "Creating…" : `Create ${nextName}`}
          </button>
        </div>
      ) : null}
      <div className="filterbar">
        {pickYear(fromYear, setFromYear, () => (setFromClass(null), setFromSection(null)), "From academic year")}
        <select aria-label="From class" value={fromClass ?? ""} onChange={(e) => (setFromClass(Number(e.target.value) || null), setFromSection(null), setToClass(null), setToSection(null))}>
          <option value="">From class…</option>
          {srcClasses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="From section" value={fromSection ?? ""} disabled={!srcClass} onChange={(e) => setFromSection(Number(e.target.value) || null)}>
          <option value="">Section…</option>
          {srcClass?.sections.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <span className="muted">to</span>
        {pickYear(toYear, setToYear, () => (setToClass(null), setToSection(null)), "To academic year", fromYear)}
        <select aria-label="To class" value={toClass ?? ""} disabled={!toYear} onChange={(e) => (setToClass(Number(e.target.value) || null), setToSection(null))}>
          <option value="">Next class…</option>
          {tgtClasses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="To section" value={toSection ?? ""} disabled={!tgtClass} onChange={(e) => setToSection(Number(e.target.value) || null)}>
          <option value="">Section…</option>
          {tgtClass?.sections.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>
          Review student results and attendance before confirming the next academic year placement. Untick a student to hold them back. To move a student
          between sections within a year, <Link href={routeOf(55)}>edit the student</Link>.
        </span>
      </div>
      <ErrorNote>{error ?? years.error ?? roster.error}</ErrorNote>
      <Panel
        title="Promotion review"
        sub={`${yearName(fromYear)} to ${yearName(toYear)}`}
        action={
          <div className="row">
            <Badge>{fromSection && toSection ? `${moving.length} to promote` : "Review pending"}</Badge>
            <button type="button" className="btn primary" disabled={busy || !fromSection || !toSection || !moving.length} onClick={promote}>
              <Icon name="check" className="sm" />
              {busy ? "Promoting…" : "Confirm promotion"}
            </button>
          </div>
        }
        flush
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="checkcell">
                  <input
                    type="checkbox"
                    aria-label="Promote everyone"
                    checked={students.length > 0 && held.size === 0}
                    onChange={(e) => setHeld(e.target.checked ? new Set() : new Set(students.map((s) => s.id)))}
                  />
                </th>
                <th>Student</th>
                <th>Current class</th>
                <th>Section</th>
                <th>Roll no.</th>
                <th>Result</th>
                <th>Next class</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id}>
                  <td className="checkcell">
                    <input type="checkbox" aria-label={`Promote ${s.full_name}`} checked={!held.has(s.id)} onChange={() => toggle(s.id)} />
                  </td>
                  <td>
                    <Person name={s.full_name} index={i} sub={s.admission_no} />
                  </td>
                  <td>{srcClass?.name ?? "—"}</td>
                  <td>{srcSection?.name ?? "—"}</td>
                  <td>{s.roll_no ?? "—"}</td>
                  <td>
                    <Badge>{resultText(s.id)}</Badge>
                  </td>
                  <td>{tgtClass ? `${tgtClass.name}${tgtSection ? ` ${tgtSection.name}` : ""}` : "—"}</td>
                  <td>
                    <Badge>{held.has(s.id) ? "Hold back" : "Promote"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={students.length > 0}>
          {!fromSection ? "Choose a class and section to review." : roster.loading ? "Loading students…" : "No active students in this section."}
        </div>
        <div className="table-footer">
          <span>{`${students.length} students · ${moving.length} selected${results.data ? ` · results from ${results.data.exams_counted} published exam${results.data.exams_counted === 1 ? "" : "s"}` : ""}`}</span>
        </div>
      </Panel>
    </>
  );
}
