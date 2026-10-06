"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { AdmissionFields, AdmissionSummary, SectionLinks, type AdmissionFormDef, type Values } from "@/features/admissions/AdmissionFields";
import type { StudentProfile as Profile } from "./types";

type Details = AdmissionFormDef & { student_id: number; values: Values; missing: string[] };
// the student record holds these; they are changed on Edit student
const ON_RECORD = new Set(["student_name", "dob", "gender"]);

/**
 * The student profile's Admission details tab: everything the admission form
 * holds for the child — identity numbers (Aadhaar, APAAR, PEN), previous
 * school, parents, addresses, languages, health. GET and PUT
 * /school/admission-form/students/{id}; the form follows the child's class.
 */
export function AdmissionBody({ s }: { s: Profile }) {
  const r = useApi<Details>(`/api/v1/school/admission-form/students/${s.id}`);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the admission details…" />;

  const editable: AdmissionFormDef = { ...d, sections: d.sections.map((x) => ({ ...x, fields: x.fields.filter((f) => !ON_RECORD.has(f.key)) })) };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/v1/school/admission-form/students/${s.id}`, { details: values });
      notify("Admission details saved.");
      setEditing(false);
      r.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Admission details"
      sub={d.missing.length ? `${d.missing.length} field${d.missing.length === 1 ? "" : "s"} the form asks for ${d.missing.length === 1 ? "is" : "are"} still empty` : "Everything the admission form asks for is on file"}
      action={
        editing ? (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={save}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setValues(d.values);
              setEditing(true);
            }}
          >
            <Icon name="pencil" className="sm" />
            Edit
          </button>
        )
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {editing ? (
        <>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Name, date of birth and gender are changed on <Link href={`${routeOf(58)}?id=${s.id}`}>Edit student</Link>.
          </p>
          <SectionLinks def={editable} values={values} />
          <AdmissionFields def={editable} values={values} onChange={(k, v) => setValues({ ...values, [k]: v })} />
        </>
      ) : (
        <>
          {d.missing.length ? <p className="af-missing">{`Still to fill in: ${d.missing.join(", ")}.`}</p> : null}
          <AdmissionSummary def={d} values={d.values} />
        </>
      )}
    </Panel>
  );
}
