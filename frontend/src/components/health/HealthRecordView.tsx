"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Table, Textarea, humanize, td } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Profile = Record<
  | "allergies"
  | "chronic_conditions"
  | "current_medications"
  | "dietary_restrictions"
  | "disabilities"
  | "doctor_name"
  | "doctor_phone"
  | "emergency_contact_name"
  | "emergency_contact_phone"
  | "emergency_contact_relation"
  | "insurance_provider"
  | "insurance_policy_no"
  | "notes",
  string | null
> & { blood_group: string | null; updated_at: string | null; updated_by_name: string | null };

type Record_ = {
  student_id: number;
  student_name: string;
  section_label: string | null;
  profile: Profile;
  checkups: { id: number; checked_on: string; height_cm: string | null; weight_kg: string | null; bmi: string | null; vision_left: string | null; vision_right: string | null; dental: string | null; notes: string | null }[];
  visits: { id: number; visited_at: string; complaint: string; temperature_c: string | null; medicine_given: string | null; outcome: string; treatment: string | null }[];
  immunizations: { id: number; vaccine: string; dose: string | null; given_on: string | null; next_due_on: string | null; notes: string | null }[];
};

const PROFILE_FIELDS: [keyof Profile, string][] = [
  ["allergies", "Allergies"],
  ["chronic_conditions", "Conditions"],
  ["current_medications", "Current medication"],
  ["dietary_restrictions", "Diet restrictions"],
  ["disabilities", "Disabilities / special needs"],
  ["doctor_name", "Family doctor"],
  ["doctor_phone", "Doctor's phone"],
  ["emergency_contact_name", "Emergency contact"],
  ["emergency_contact_phone", "Emergency phone"],
  ["emergency_contact_relation", "Relation"],
  ["insurance_provider", "Insurance"],
  ["insurance_policy_no", "Policy no."],
  ["notes", "Notes"],
];

/** A student's health record. `mode="school"` can add checkups/vaccines; parents can edit the profile. */
export function HealthRecordView({ recordUrl, profileUrl, mode }: { recordUrl: string; profileUrl: string; mode: "school" | "parent" }) {
  const [rec, setRec] = useState<Record_ | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Record_>(recordUrl);
      setRec(data);
      setForm(Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, data.profile[k] ?? ""])));
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordUrl]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await api.put(profileUrl, Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null])));
      setEditing(false);
      setNotice("Medical details saved.");
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  if (!rec) return <ErrorBox>{error}</ErrorBox>;
  const p = rec.profile;
  const school = mode === "school";

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {p.allergies && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">Allergies: {p.allergies}</div>}

      <Card>
        <CardHeader>
          <CardTitle>
            Medical details {p.blood_group && <Badge tone="rose">{p.blood_group}</Badge>}
          </CardTitle>
          {!editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardBody>
          {editing ? (
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {PROFILE_FIELDS.map(([k, label]) =>
                  ["allergies", "chronic_conditions", "current_medications", "notes"].includes(k) ? (
                    <Textarea key={k} label={label} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  ) : (
                    <Input key={k} label={label} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  )
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {PROFILE_FIELDS.map(([k, label]) => (
                <div key={k} className="grid grid-cols-2 gap-2">
                  <dt className="text-ink-subtle">{label}</dt>
                  <dd className="whitespace-pre-wrap text-ink">{p[k] || "—"}</dd>
                </div>
              ))}
              {p.updated_at && (
                <div className="text-xs text-ink-subtle sm:col-span-2">
                  Updated {new Date(p.updated_at).toLocaleString()} by {p.updated_by_name}
                </div>
              )}
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checkups</CardTitle>
        </CardHeader>
        {school && <AddCheckup studentId={rec.student_id} onSaved={load} onError={setError} />}
        <Table head={["Date", "Height", "Weight", "BMI", "Vision L/R", "Dental", "Notes"]} empty={rec.checkups.length === 0 && "No checkups recorded."}>
          {rec.checkups.map((c) => (
            <tr key={c.id}>
              <td className={td}>{c.checked_on}</td>
              <td className={td}>{c.height_cm ? `${c.height_cm} cm` : "—"}</td>
              <td className={td}>{c.weight_kg ? `${c.weight_kg} kg` : "—"}</td>
              <td className={td}>{c.bmi ?? "—"}</td>
              <td className={td}>
                {c.vision_left ?? "—"} / {c.vision_right ?? "—"}
              </td>
              <td className={td}>{c.dental ?? "—"}</td>
              <td className={td}>{c.notes ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Immunizations</CardTitle>
        </CardHeader>
        {school && <AddImmunization studentId={rec.student_id} onSaved={load} onError={setError} />}
        <Table head={["Vaccine", "Dose", "Given", "Next due"]} empty={rec.immunizations.length === 0 && "None recorded."}>
          {rec.immunizations.map((i) => (
            <tr key={i.id}>
              <td className={td}>{i.vaccine}</td>
              <td className={td}>{i.dose ?? "—"}</td>
              <td className={td}>{i.given_on ?? "—"}</td>
              <td className={td}>{i.next_due_on ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sick-room visits</CardTitle>
        </CardHeader>
        <Table head={["When", "Complaint", "Given", "Outcome"]} empty={rec.visits.length === 0 && "No visits."}>
          {rec.visits.map((v) => (
            <tr key={v.id}>
              <td className={td}>{new Date(v.visited_at).toLocaleString()}</td>
              <td className={td}>
                {v.complaint}
                {v.temperature_c && ` · ${v.temperature_c}°C`}
                {v.treatment && <div className="text-xs text-ink-subtle">{v.treatment}</div>}
              </td>
              <td className={td}>{v.medicine_given ?? "—"}</td>
              <td className={td}>{humanize(v.outcome)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function AddCheckup({ studentId, onSaved, onError }: { studentId: number; onSaved: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ checked_on: new Date().toISOString().slice(0, 10), height_cm: "", weight_kg: "", vision_left: "", vision_right: "", dental: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid items-end gap-2 border-b border-surface-border p-4 sm:grid-cols-7"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post(`/api/v1/school/health/students/${studentId}/checkups`, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])));
          setF({ ...f, height_cm: "", weight_kg: "", vision_left: "", vision_right: "", dental: "" });
          onSaved();
        } catch (err) {
          onError(apiError(err));
        }
      }}
    >
      <Input label="Date" type="date" value={f.checked_on} onChange={set("checked_on")} required />
      <Input label="Height cm" type="number" step="0.1" value={f.height_cm} onChange={set("height_cm")} />
      <Input label="Weight kg" type="number" step="0.1" value={f.weight_kg} onChange={set("weight_kg")} />
      <Input label="Vision L" placeholder="6/6" value={f.vision_left} onChange={set("vision_left")} />
      <Input label="Vision R" placeholder="6/6" value={f.vision_right} onChange={set("vision_right")} />
      <Input label="Dental" value={f.dental} onChange={set("dental")} />
      <Button type="submit">Add</Button>
    </form>
  );
}

function AddImmunization({ studentId, onSaved, onError }: { studentId: number; onSaved: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ vaccine: "", dose: "", given_on: "", next_due_on: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid items-end gap-2 border-b border-surface-border p-4 sm:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post(`/api/v1/school/health/students/${studentId}/immunizations`, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])));
          setF({ vaccine: "", dose: "", given_on: "", next_due_on: "" });
          onSaved();
        } catch (err) {
          onError(apiError(err));
        }
      }}
    >
      <Input label="Vaccine *" value={f.vaccine} onChange={set("vaccine")} required />
      <Input label="Dose" value={f.dose} onChange={set("dose")} />
      <Input label="Given on" type="date" value={f.given_on} onChange={set("given_on")} />
      <Input label="Next due" type="date" value={f.next_due_on} onChange={set("next_due_on")} />
      <Button type="submit">Add</Button>
    </form>
  );
}
