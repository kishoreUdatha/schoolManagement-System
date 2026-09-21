"use client";

/*
 * Small helpers shared by the online-test screens (NEW-022 to NEW-024) and
 * the other new exam screens: page-head buttons that talk to the live
 * component under them, a labelled field, and the class-subjects the
 * signed-in person may set questions and tests for.
 */

import { useEffect, useMemo, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { screen } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Answer, Bloom, ClassSubjectRow, Difficulty, Kind, Option, TestRead } from "./types";

/** Where the online-test screens live (NEW-023, NEW-024). */
export const TESTS_ROUTE = () => screen("NEW-023").route;
export const RESULTS_ROUTE = () => screen("NEW-024").route;

/** The words for a test's state, as a badge reads them. */
export function testState(t: TestRead): string {
  if (t.is_open) return "Open now";
  if (t.status === "draft") return "Draft";
  if (t.status === "closed") return "Closed";
  return "Scheduled";
}

const EVENT = "onlinetests:page-action";

/** A page-head button. The page is a server component, so the button
 *  announces itself and the live component on the page answers. */
export function PageAction({ name, icon, primary = false, children }: { name: string; icon: IconName; primary?: boolean; children: string }) {
  return (
    <button type="button" className={`btn ${primary ? "primary" : ""}`} onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

/** Run `fn` when the page-head button called `name` is pressed. */
export function usePageAction(name: string, fn: () => void) {
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === name) fn();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [name, fn]);
}

/** The mock's `.field`: a label over its control. */
export function Field({ label, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * Class-subjects from GET /school/syllabus: which classes teach which
 * subject, the sections, and whether this person may write for it
 * (`can_edit`). Subjects are folded out of it for the question bank.
 */
export function useClassSubjects() {
  const res = useApi<ClassSubjectRow[]>("/api/v1/school/syllabus");
  const rows = useMemo(() => res.data ?? [], [res.data]);
  const subjects = useMemo(() => {
    const m = new Map<number, { id: number; name: string; classes: string[]; writable: boolean }>();
    rows.forEach((r) => {
      const s = m.get(r.subject_id) ?? { id: r.subject_id, name: r.subject_name, classes: [], writable: false };
      if (!s.classes.includes(r.class_name)) s.classes.push(r.class_name);
      s.writable ||= r.can_edit;
      m.set(r.subject_id, s);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  return { rows, subjects, loading: res.loading, error: res.error };
}

export const KINDS: [Kind, string][] = [
  ["single", "Multiple choice (one answer)"],
  ["multiple", "Multiple choice (several answers)"],
  ["true_false", "True / false"],
  ["numeric", "Numeric answer"],
  ["short", "Short answer (teacher marks)"],
];
export const kindLabel = (k: Kind) => KINDS.find(([v]) => v === k)?.[1] ?? k;
export const KIND_SHORT: Record<Kind, string> = { single: "MCQ", multiple: "Multi-select", true_false: "True / false", numeric: "Numeric", short: "Short answer" };

export const BLOOMS: Bloom[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "2.00" -> "2", "0.50" -> "0.5". */
export const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(Number(v)));

/** An answer (key or response) as words. */
export function answerText(q: { kind: Kind; options: Option[] }, a: Answer | undefined | null): string {
  if (!a) return "—";
  if (q.kind === "numeric") return a.value === undefined || a.value === null ? "—" : `${a.value}${a.tolerance ? ` (± ${a.tolerance})` : ""}`;
  if (q.kind === "short") return a.text ?? a.model_answer ?? "—";
  const keys = a.keys ?? [];
  if (!keys.length) return "—";
  return keys.map((k) => `${k}. ${q.options.find((o) => o.key === k)?.text ?? ""}`).join("; ");
}

/** An ISO time as the value of a datetime-local input, in local time. */
export function localInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
