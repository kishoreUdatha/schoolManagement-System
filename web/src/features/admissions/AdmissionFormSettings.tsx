"use client";

import { Fragment, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import { useYears } from "./shared";

type Rule = { required: string[]; hidden: string[] };
type Settings = {
  fields: { key: string; label: string; section: string; core: boolean; help: string | null }[];
  sections: { key: string; title: string }[];
  always: string[];
  default: Rule & { customised: boolean };
  classes: (Rule & { class_id: number; class_name: string })[];
};
type Choice = "required" | "optional" | "hidden";

/**
 * NEW-003: which admission form fields the school requires and which it does
 * not ask — for every class, and for any class that differs.
 * GET /school/admission-form/settings, PUT …/settings, DELETE …/settings/{class_id}.
 */
export function AdmissionFormSettings() {
  const r = useApi<Settings>("/api/v1/school/admission-form/settings");
  const years = useYears();
  const classes = useApi<SchoolClass[]>(years.current ? "/api/v1/school/classes" : null, { academic_year_id: years.current?.id });
  const [scope, setScope] = useState<number | "">("");
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  const own = d && scope ? d.classes.find((c) => c.class_id === scope) : undefined;
  const rule: Rule | undefined = d ? (scope ? (own ?? d.default) : d.default) : undefined;

  // load the rule for the chosen scope
  useEffect(() => {
    if (!d || !rule) return;
    const next: Record<string, Choice> = {};
    for (const f of d.fields) next[f.key] = rule.required.includes(f.key) ? "required" : rule.hidden.includes(f.key) ? "hidden" : "optional";
    setChoice(next);
    setDirty(false);
  }, [d, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the admission form…" />;
  const always = new Set(d.always);
  const count = (c: Choice) => d.fields.filter((f) => (always.has(f.key) ? "required" : choice[f.key]) === c).length;
  const className = (id: number) => classes.data?.find((c) => c.id === id)?.name ?? d.classes.find((c) => c.class_id === id)?.class_name ?? "this class";

  const setAll = (section: string, c: Choice) => {
    const next = { ...choice };
    for (const f of d.fields) if (f.section === section && !always.has(f.key)) next[f.key] = c;
    setChoice(next);
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/v1/school/admission-form/settings", {
        class_id: scope || null,
        required: Object.keys(choice).filter((k) => choice[k] === "required"),
        hidden: Object.keys(choice).filter((k) => choice[k] === "hidden" && !always.has(k)),
      });
      notify(scope ? `Saved: ${className(scope)} now has its own admission form.` : "Saved: the admission form for every class.");
      r.reload();
      setDirty(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function useDefault() {
    if (!scope || !(await ask(`${className(scope)} goes back to the school's default admission form. Its own choices are removed.`))) return;
    try {
      await api.delete(`/api/v1/school/admission-form/settings/${scope}`);
      notify(`${className(scope)} now uses the default form.`);
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <div className="ie-filters">
        <label>
          Form for
          <select value={scope} onChange={(e) => setScope(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Every class (the default)</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.name}${d.classes.some((x) => x.class_id === c.id) ? " · own form" : ""}`}
              </option>
            ))}
          </select>
        </label>
        <div className="af-counts">
          <span className="jv-status posted">{`${count("required")} required`}</span>
          <span className="jv-status draft">{`${count("optional")} optional`}</span>
          <span className="jv-status void">{`${count("hidden")} not asked`}</span>
        </div>
        {scope && own ? (
          <button type="button" className="btn" onClick={useDefault}>
            Use the default
          </button>
        ) : null}
        <button type="button" className="btn primary" disabled={saving || !dirty} onClick={save}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel
        title={scope ? `Admission form for ${className(scope)}` : "Admission form for every class"}
        sub={
          scope
            ? own
              ? "This class has its own choices."
              : "This class uses the default. Change anything and save to give it its own."
            : "Classes without their own choices use these. A draft can always be saved incomplete; these apply when it is submitted."
        }
        flush
      >
        <div className="table-wrap">
          <table className="data-table ie-table af-settings">
            <thead>
              <tr>
                <th>Field</th>
                <th className="center">Required</th>
                <th className="center">Optional</th>
                <th className="center">Not asked</th>
              </tr>
            </thead>
            <tbody>
              {d.sections.map((s) => (
                <Fragment key={s.key}>
                  <tr className="ie-section">
                    <td>{s.title}</td>
                    {(["required", "optional", "hidden"] as Choice[]).map((c) => (
                      <td key={c} className="center">
                        <button type="button" className="btn text af-all" onClick={() => setAll(s.key, c)}>
                          all
                        </button>
                      </td>
                    ))}
                  </tr>
                  {d.fields
                    .filter((f) => f.section === s.key)
                    .map((f) => (
                      <tr key={f.key}>
                        <td>
                          {f.label}
                          {f.help ? <small className="muted" style={{ display: "block" }}>{f.help}</small> : null}
                        </td>
                        {always.has(f.key) ? (
                          <td colSpan={3} className="center muted small">
                            Always required
                          </td>
                        ) : (
                          (["required", "optional", "hidden"] as Choice[]).map((c) => (
                            <td key={c} className="center">
                              <input
                                type="radio"
                                name={`af-${f.key}`}
                                aria-label={`${f.label}: ${c === "hidden" ? "not asked" : c}`}
                                checked={choice[f.key] === c}
                                onChange={() => {
                                  setChoice({ ...choice, [f.key]: c });
                                  setDirty(true);
                                }}
                              />
                            </td>
                          ))
                        )}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
