"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import type { FormField } from "./AdmissionFields";
import { useYears } from "./shared";

type Rule = { required: string[]; hidden: string[] };
type Preset = Rule & { key: string; name: string };
type Section = { key: string; title: string };
type Field = Pick<FormField, "key" | "label" | "section" | "type" | "options" | "core" | "help" | "when" | "custom" | "id">;
type Settings = {
  fields: Field[];
  sections: Section[];
  all_sections: Section[];
  always: string[];
  board: string | null;
  presets: Preset[];
  default: Rule & { customised: boolean };
  classes: (Rule & { class_id: number; class_name: string })[];
  custom: Field[];
  max_custom: number;
};
type Choice = "required" | "optional" | "hidden";

const BASE = "/api/v1/school/admission-form";
const WHEN: Record<string, string> = {
  foreign: "Asked only when the nationality is not Indian",
  comm_abroad: "Asked only for an address outside India",
  perm_abroad: "Asked only for an address outside India",
};
const TYPES: [string, string][] = [
  ["text", "Short answer"],
  ["textarea", "Long answer"],
  ["select", "Choose from a list"],
  ["bool", "Yes / no tick box"],
  ["date", "Date"],
  ["phone", "Mobile number"],
  ["email", "Email"],
];

/**
 * NEW-003: the admission form, as this school wants it — its board's usual
 * fields to start from, which fields are required and which are not asked
 * (for every class, and for a class that differs), and questions of its own.
 * GET /school/admission-form/settings, PUT …/settings, DELETE …/settings/{class_id},
 * POST / PUT / DELETE …/questions.
 */
export function AdmissionFormSettings() {
  const r = useApi<Settings>(`${BASE}/settings`);
  const years = useYears();
  const classes = useApi<SchoolClass[]>(years.current ? "/api/v1/school/classes" : null, { academic_year_id: years.current?.id });
  const [scope, setScope] = useState<number | "">("");
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [board, setBoard] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Field | "new" | null>(null);
  const d = r.data;
  const own = d && scope ? d.classes.find((c) => c.class_id === scope) : undefined;
  const rule: Rule | undefined = d ? (scope ? (own ?? d.default) : d.default) : undefined;

  // load the rule for the chosen scope
  useEffect(() => {
    if (!d || !rule) return;
    const next: Record<string, Choice> = {};
    for (const f of d.fields) next[f.key] = rule.required.includes(f.key) ? "required" : rule.hidden.includes(f.key) ? "hidden" : "optional";
    setChoice(next);
    setBoard(d.board ?? "");
    setDirty(false);
  }, [d, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the admission form…" />;
  const always = new Set(d.always);
  const count = (c: Choice) => d.fields.filter((f) => (always.has(f.key) ? "required" : choice[f.key]) === c).length;
  const className = (id: number) => classes.data?.find((c) => c.id === id)?.name ?? d.classes.find((c) => c.class_id === id)?.class_name ?? "this class";
  const boardName = d.presets.find((p) => p.key === d.board)?.name;

  const setAll = (section: string, c: Choice) => {
    const next = { ...choice };
    for (const f of d.fields) if (f.section === section && !always.has(f.key)) next[f.key] = c;
    setChoice(next);
    setDirty(true);
  };

  function applyPreset(key: string) {
    setBoard(key);
    const p = d!.presets.find((x) => x.key === key);
    if (!p) return;
    const next: Record<string, Choice> = {};
    for (const f of d!.fields) next[f.key] = p.required.includes(f.key) ? "required" : p.hidden.includes(f.key) ? "hidden" : "optional";
    setChoice(next);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`${BASE}/settings`, {
        class_id: scope || null,
        required: Object.keys(choice).filter((k) => choice[k] === "required"),
        hidden: Object.keys(choice).filter((k) => choice[k] === "hidden" && !always.has(k)),
        board: !scope && board ? board : null,
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
      await api.delete(`${BASE}/settings/${scope}`);
      notify(`${className(scope)} now uses the default form.`);
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function removeQuestion(f: Field) {
    if (!(await ask(`Stop asking "${f.label}"? Answers already given stay on the applications and student records that have them.`))) return;
    try {
      await api.delete(`${BASE}/questions/${f.id}`);
      notify(`"${f.label}" is no longer asked.`);
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <div className="ie-filters">
        <label>
          {scope ? "Start from" : "School board"}
          <select value={scope ? "" : board} onChange={(e) => e.target.value && applyPreset(e.target.value)}>
            <option value="">{scope ? "Choose a board's usual form" : "Choose the board"}</option>
            {d.presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
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
        title="Your own questions"
        sub={`Questions the built-in form does not ask. ${d.custom.length} of ${d.max_custom} used.`}
        action={
          <button type="button" className="btn" onClick={() => setEditing("new")} disabled={d.custom.length >= d.max_custom}>
            <Icon name="plus" className="sm" />
            Add a question
          </button>
        }
      >
        {d.custom.length ? (
          <div className="checklist">
            {d.custom.map((f) => (
              <div className="check-item" key={f.key}>
                <Icon name="file" className="sm" />
                <label>
                  {f.label}
                  <small>{`${TYPES.find(([k]) => k === f.type)?.[1] ?? f.type} · in ${d.all_sections.find((s) => s.key === f.section)?.title ?? f.section}${f.options ? ` · ${f.options.join(", ")}` : ""}`}</small>
                </label>
                <button type="button" className="btn" onClick={() => setEditing(f)}>
                  Edit
                </button>
                <button type="button" className="btn text" onClick={() => removeQuestion(f)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">None yet. Add one for anything your school asks that is not below, such as a house preference or a board-specific declaration.</p>
        )}
      </Panel>

      <Panel
        title={scope ? `Admission form for ${className(scope)}` : "Admission form for every class"}
        sub={
          scope
            ? own
              ? "This class has its own choices."
              : "This class uses the default. Change anything and save to give it its own."
            : `${boardName ? `${boardName} school. ` : ""}Classes without their own choices use these. A draft can always be saved incomplete; these apply when it is submitted.`
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
                          {f.custom ? <span className="af-own">your question</span> : null}
                          {f.when || f.help ? <small className="muted" style={{ display: "block" }}>{[f.when ? WHEN[f.when] : null, f.help].filter(Boolean).join(" · ")}</small> : null}
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
      {editing ? (
        <QuestionDialog
          field={editing === "new" ? null : editing}
          sections={d.all_sections}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            r.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** Add a question, or change one (its answer type stays, since answers may exist). */
function QuestionDialog({ field, sections, onClose, onSaved }: { field: Field | null; sections: Section[]; onClose: () => void; onSaved: () => void }) {
  const [labelText, setLabelText] = useState(field?.label ?? "");
  const [section, setSection] = useState(field?.section ?? "additional");
  const [type, setType] = useState<string>(field?.type ?? "text");
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  const [help, setHelp] = useState(field?.help ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      label: labelText,
      section,
      type,
      options: type === "select" ? options.split(/\n|,/).map((o) => o.trim()).filter(Boolean) : null,
      help: help || null,
    };
    try {
      if (field) await api.put(`${BASE}/questions/${field.id}`, body);
      else await api.post(`${BASE}/questions`, body);
      notify(field ? "Question saved." : `"${labelText.trim()}" added. Choose below whether it is required.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={field ? "Edit question" : "Add a question"}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : field ? "Save" : "Add question"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <label className="field full">
          <span>
            Question<span className="req">*</span>
          </span>
          <input value={labelText} onChange={(e) => setLabelText(e.target.value)} maxLength={120} placeholder="e.g. House preference" />
        </label>
        <label className="field">
          <span>Answer type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} disabled={Boolean(field)}>
            {TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {field ? <small className="muted">Fixed once answers may exist</small> : null}
        </label>
        <label className="field">
          <span>Show it in</span>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {type === "select" ? (
          <label className="field full">
            <span>
              Options<span className="req">*</span>
            </span>
            <textarea rows={4} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={"One per line, e.g.\nRed\nBlue\nGreen"} />
          </label>
        ) : null}
        <label className="field full">
          <span>Help text</span>
          <input value={help} onChange={(e) => setHelp(e.target.value)} maxLength={200} placeholder="Shown under the question (optional)" />
        </label>
      </div>
    </Dialog>
  );
}
