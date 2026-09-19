"use client";

import { useEffect, useState } from "react";

import { fieldClass } from "@/components/ui/Field";
import { api } from "@/lib/api";

export type PickedStudent = { id: number; full_name: string; admission_no: string };

/** Type-ahead search over the school's active students. */
export function StudentPicker({
  label = "Student",
  value,
  onChange,
}: {
  label?: string;
  value: PickedStudent | null;
  onChange: (s: PickedStudent | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedStudent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<{ items: PickedStudent[] }>("/api/v1/school/students", {
          params: { search: q.trim(), status: "active", page_size: 10 },
        })
        .then((r) => setResults(r.data.items))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <div className={`${fieldClass} flex items-center justify-between`}>
          <span>
            {value.full_name} <span className="text-ink-subtle">· {value.admission_no}</span>
          </span>
          <button type="button" className="text-xs text-ink-subtle hover:text-ink" onClick={() => onChange(null)}>
            change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <input
        className={fieldClass}
        placeholder="Type a name or admission no."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-surface-border bg-surface-raised shadow-xl">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-hover"
                onClick={() => {
                  onChange(s);
                  setQ("");
                  setOpen(false);
                }}
              >
                {s.full_name} <span className="text-ink-subtle">· {s.admission_no}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
