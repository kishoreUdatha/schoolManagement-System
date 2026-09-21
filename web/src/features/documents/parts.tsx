"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";

export type PickedStudent = { id: number; full_name: string; admission_no: string; section_label?: string | null };

const shown = (s: PickedStudent) => `${s.full_name} · ${s.admission_no}${s.section_label ? ` · ${s.section_label}` : ""}`;

/**
 * Type-ahead over GET /api/v1/school/directory/students (the old
 * frontend's StudentPicker), drawn as the mock's field input.
 */
export function StudentSearch({
  value,
  onChange,
  required = false,
  disabled = false,
}: {
  value: PickedStudent | null;
  onChange: (s: PickedStudent | null) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const [q, setQ] = useState(value ? shown(value) : "");
  const [results, setResults] = useState<PickedStudent[]>([]);

  useEffect(() => {
    if (value && q !== shown(value)) setQ(shown(value));
    // Only when a new student is given from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.id]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || (value && q === shown(value))) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<PickedStudent[]>("/api/v1/school/directory/students", { search: term })
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, value]);

  return (
    <>
      <input
        type="search"
        list={listId}
        value={q}
        required={required}
        disabled={disabled}
        placeholder="Type a name or admission no."
        aria-label="Student"
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          onChange(results.find((r) => shown(r) === v) ?? null);
        }}
      />
      <datalist id={listId}>
        {results.map((r) => (
          <option key={r.id} value={shown(r)} />
        ))}
      </datalist>
    </>
  );
}

const TONE: Record<string, string> = {
  verified: "",
  issued: "",
  active: "",
  pending: "warn",
  requested: "warn",
  rejected: "bad",
  expired: "bad",
  cancelled: "neutral",
  inactive: "neutral",
};

/**
 * Status pill with the tone set from the API's own status. The shared
 * Badge guesses tone from words and has no entry for "rejected",
 * "requested" or "cancelled", which would show them green.
 */
export function StatusBadge({ status, text }: { status: string; text?: string }) {
  const tone = TONE[status] ?? "";
  return <span className={`badge ${tone}`}>{text ?? status[0].toUpperCase() + status.slice(1)}</span>;
}
