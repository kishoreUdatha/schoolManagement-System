"use client";

import type { ReactNode } from "react";
import { label as pretty } from "@/lib/format";

// The full admission form, as the API describes it (services/admission_form.py):
// sections of fields, each with its type and whether this class requires it,
// does not ask it, or always requires it.

export type FieldType = "text" | "date" | "select" | "phone" | "email" | "aadhaar" | "apaar" | "pen" | "pin" | "year" | "textarea" | "bool";
export type FormField = {
  key: string;
  label: string;
  section: string;
  type: FieldType;
  options: string[] | null;
  core: boolean;
  help: string | null;
  /** asked only sometimes: "foreign" (not an Indian national), "comm_abroad" / "perm_abroad" (address outside India) */
  when: "foreign" | "comm_abroad" | "perm_abroad" | null;
  /** a date that may be ahead of today (a passport's expiry) */
  future: boolean;
  /** one of the school's own questions */
  custom: boolean;
  id?: number;
  required: boolean;
  hidden: boolean;
  locked: boolean;
};
export type FormSection = { key: string; title: string; fields: FormField[] };
export type AdmissionFormDef = { class_id: number | null; sections: FormSection[] };
export type Values = Record<string, string | boolean | null | undefined>;

const DIGITS: Partial<Record<FieldType, number>> = { aadhaar: 12, apaar: 12, pen: 11, pin: 6, year: 4 };
const PERMANENT = /^perm_/;
export const ABROAD = "Outside India";

/** A nationality typed and not Indian (services/admission_form.is_foreign). */
export function isForeign(v: Values): boolean {
  const n = String(v.nationality ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return Boolean(n) && !["indian", "india", "bharatiya", "bhartiya"].includes(n);
}

/** Whether a field is asked given what is filled in (services/admission_form.asked). */
export function asked(f: FormField, v: Values): boolean {
  if (f.when === "foreign") return isForeign(v);
  if (f.when === "comm_abroad" || f.when === "perm_abroad") return v[`${f.when.slice(0, 4)}_state`] === ABROAD;
  if (PERMANENT.test(f.key) && v.permanent_same) return false;
  return true;
}

/** Whether a field is shown: not hidden by the school, and asked. */
export function shown(f: FormField, v: Values): boolean {
  return !f.hidden && asked(f, v);
}

/** Labels of required fields still empty (a ticked declaration counts as filled). */
export function missing(def: AdmissionFormDef | null, v: Values): string[] {
  if (!def) return [];
  const out: string[] = [];
  for (const s of def.sections)
    for (const f of s.fields) {
      if (!f.required || !shown(f, v)) continue;
      const x = v[f.key];
      if (f.type === "bool") {
        if (f.key === "declaration" && !x) out.push(f.label);
      } else if (x === undefined || x === null || String(x).trim() === "") out.push(f.label);
    }
  return out;
}

/** Split filled values into the application's own fields and the rest of the form. */
export function split(def: AdmissionFormDef | null, v: Values): { core: Values; details: Values } {
  const core: Values = {};
  const details: Values = {};
  for (const s of def?.sections ?? [])
    for (const f of s.fields) {
      const x = v[f.key];
      const val = f.type === "bool" ? Boolean(x) : x === undefined || x === null || String(x).trim() === "" ? null : String(x).trim();
      if (f.core) core[f.key] = val;
      else if (val !== null && val !== false) details[f.key] = val;
    }
  return { core, details };
}

function Control({ f, value, onChange, readOnly, abroad }: { f: FormField; value: Values[string]; onChange: (v: string | boolean) => void; readOnly?: boolean; abroad?: boolean }) {
  const common = { id: `af-${f.key}`, name: f.key, disabled: readOnly, "aria-required": f.required || undefined };
  const text = value === undefined || value === null || typeof value === "boolean" ? "" : value;
  if (f.type === "bool")
    return (
      <span className="row af-check">
        <input type="checkbox" {...common} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{f.label}</span>
      </span>
    );
  if (f.type === "select")
    return (
      <select {...common} value={text} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {f.key === "gender" ? pretty(o) : o}
          </option>
        ))}
      </select>
    );
  if (f.type === "textarea") return <textarea {...common} rows={2} maxLength={500} value={text} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === "date") return <input type="date" {...common} max={f.future ? undefined : new Date().toISOString().slice(0, 10)} value={text} onChange={(e) => onChange(e.target.value)} />;
  // an address abroad has a postal code of its own shape
  const n = f.type === "pin" && abroad ? undefined : DIGITS[f.type];
  return (
    <input
      type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
      inputMode={n ? "numeric" : undefined}
      maxLength={n ? n + 4 : f.type === "phone" ? 20 : f.type === "pin" ? 12 : f.core && f.key === "notes" ? 5000 : 160}
      placeholder={f.type === "year" ? "e.g. 2024" : n ? `${n} digits` : f.type === "phone" ? "10-digit mobile, or +country code" : undefined}
      {...common}
      value={text}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * The form's sections, numbered, in the mock's form-section markup. `only`
 * limits it to some sections; `before` puts content (the class and year,
 * say) at the top of the first.
 */
export function AdmissionFields({
  def,
  values,
  onChange,
  readOnly = false,
  only,
  before,
  errors = [],
}: {
  def: AdmissionFormDef;
  values: Values;
  onChange: (key: string, v: string | boolean) => void;
  readOnly?: boolean;
  only?: string[];
  before?: ReactNode;
  errors?: string[];
}) {
  const sections = def.sections.filter((s) => !only || only.includes(s.key)).map((s) => ({ ...s, fields: s.fields.filter((f) => shown(f, values)) })).filter((s) => s.fields.length);
  const wrong = new Set(errors);
  return (
    <div className="form-sections af-sections">
      {sections.map((s, i) => (
        <section key={s.key} id={`af-section-${s.key}`}>
          <div className="form-section-title">
            <span className="number">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
          </div>
          <div className="form-grid">
            {i === 0 ? before : null}
            {s.fields.map((f) =>
              f.type === "bool" ? (
                <label key={f.key} className={`field full ${wrong.has(f.label) ? "af-wrong" : ""}`}>
                  <Control f={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} readOnly={readOnly} />
                </label>
              ) : (
                <label key={f.key} className={`field ${f.type === "textarea" ? "full" : ""} ${wrong.has(f.label) ? "af-wrong" : ""}`} htmlFor={`af-${f.key}`}>
                  <span>
                    {f.label}
                    {f.required ? <span className="req">*</span> : null}
                  </span>
                  <Control f={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} readOnly={readOnly} abroad={values[`${f.key.slice(0, 4)}_state`] === ABROAD} />
                  {f.help ? <small className="muted">{f.help}</small> : null}
                </label>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Jump links to each section, for a long form. */
export function SectionLinks({ def, values }: { def: AdmissionFormDef; values: Values }) {
  const sections = def.sections.filter((s) => s.fields.some((f) => shown(f, values)));
  return (
    <nav className="af-jump" aria-label="Form sections">
      {sections.map((s, i) => (
        <a key={s.key} href={`#af-section-${s.key}`}>{`${i + 1}. ${s.title}`}</a>
      ))}
    </nav>
  );
}

/** Filled fields only, section by section, for reading. */
export function AdmissionSummary({ def, values }: { def: AdmissionFormDef; values: Values }) {
  const show = (f: FormField) => {
    const v = values[f.key];
    if (f.type === "bool") return v ? "Yes" : null;
    if (v === undefined || v === null || String(v).trim() === "") return null;
    return f.key === "gender" ? pretty(String(v)) : String(v);
  };
  const sections = def.sections
    .map((s) => ({ ...s, rows: s.fields.filter((f) => shown(f, values)).map((f) => [f.label, show(f)] as const).filter(([, v]) => v !== null) }))
    .filter((s) => s.rows.length);
  if (!sections.length) return <p className="muted small">Nothing beyond the basics has been filled in yet.</p>;
  return (
    <div className="af-summary">
      {sections.map((s) => (
        <div key={s.key}>
          <h4>{s.title}</h4>
          <dl className="kv">
            {s.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
