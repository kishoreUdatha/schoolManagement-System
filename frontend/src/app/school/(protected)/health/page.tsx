"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { AlertTriangle, DoorOpen, HeartPulse, Pill, Stethoscope, Syringe } from "lucide-react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PanelFooter, QuickActions, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Visit = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  visited_at: string;
  complaint: string;
  temperature_c: string | null;
  treatment: string | null;
  medicine_given: string | null;
  outcome: string;
  parent_notified: boolean;
  recorded_by_name: string | null;
  allergies: string | null;
};

type Alert = {
  student_id: number;
  student_name: string;
  section_label: string | null;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  emergency_contact_phone: string | null;
};

type Due = { id: number; student_id: number; student_name: string; section_label: string | null; vaccine: string; dose: string | null; next_due_on: string };

type Dash = {
  visits_today: number;
  sent_home_today: number;
  referred_today: number;
  students_with_alerts: number;
  immunizations_due: number;
  follow_ups_due: number;
};

const OUTCOMES = ["back_to_class", "rested", "sent_home", "parent_picked_up", "referred_hospital"];
const outcomeTone = (o: string) => (o === "referred_hospital" ? "rose" : o === "sent_home" || o === "parent_picked_up" ? "amber" : "emerald");

export default function HealthPage() {
  const [tab, setTab] = useState<"visits" | "alerts" | "immunizations">("visits");
  const [dash, setDash] = useState<Dash | null>(null);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [due, setDue] = useState<Due[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [studentAllergy, setStudentAllergy] = useState<string | null>(null);
  const [form, setForm] = useState({ complaint: "", temperature_c: "", treatment: "", medicine_given: "", outcome: "back_to_class", notify_parent: true });

  async function load() {
    try {
      const [d, v, a, i] = await Promise.all([
        api.get<Dash>("/api/v1/school/health/dashboard"),
        api.get<Visit[]>("/api/v1/school/health/visits", { params: { on: day } }),
        api.get<Alert[]>("/api/v1/school/health/alerts"),
        api.get<Due[]>("/api/v1/school/health/immunizations-due"),
      ]);
      setDash(d.data);
      setVisits(v.data);
      setAlerts(a.data);
      setDue(i.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useEffect(() => {
    setStudentAllergy(student ? alerts.find((a) => a.student_id === student.id)?.allergies ?? null : null);
  }, [student, alerts]);

  async function record(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setError(null);
    try {
      const { data } = await api.post<Visit>("/api/v1/school/health/visits", {
        student_id: student.id,
        complaint: form.complaint,
        temperature_c: form.temperature_c || null,
        treatment: form.treatment || null,
        medicine_given: form.medicine_given || null,
        outcome: form.outcome,
        notify_parent: form.notify_parent,
      });
      setNotice(`Visit recorded for ${data.student_name}.${data.parent_notified ? " Parents notified." : ""}`);
      setStudent(null);
      setForm({ complaint: "", temperature_c: "", treatment: "", medicine_given: "", outcome: "back_to_class", notify_parent: true });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const mustNotify = ["sent_home", "parent_picked_up", "referred_hospital"].includes(form.outcome);

  return (
    <div className="space-y-[18px]">
      {/* No welcome band here. This is the sick room's own screen rather than
          somebody's landing page — a nurse opens it mid-incident, and a
          greeting would be the first thing between them and the figures. */}
      <PageHeader
        title="Health"
        subtitle="Sick-room visits, medical alerts, checkups and immunizations."
        actions={
          <Link href="/school/health/emergency">
            <Button>Emergency contacts</Button>
          </Link>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {dash && (
        // Five figures, not four: they are the five the dashboard endpoint
        // already returns, and dropping one to make the grid tidy would
        // hide a child who has been sent to hospital.
        <StatStrip
          className="lg:grid-cols-5"
          stats={[
            { label: "Visits today", value: dash.visits_today, icon: Stethoscope },
            { label: "Sent home", value: dash.sent_home_today, icon: DoorOpen },
            { label: "Referred to hospital", value: dash.referred_today, icon: AlertTriangle },
            {
              label: "Medical alerts",
              value: dash.students_with_alerts,
              note: "Allergies / conditions",
              icon: HeartPulse,
            },
            {
              label: "Vaccines due",
              value: dash.immunizations_due,
              note: "Next 30 days",
              icon: Syringe,
            },
          ]}
        />
      )}

      {/* Two, not four. /school/health/students has no index page — only
          the per-student route the tables below already link to — so a
          "Health records" shortcut would have been a 404. */}
      <QuickActions
        actions={[
          { label: "Immunisation", href: "/school/health/immunisation", icon: Syringe },
          { label: "Medication", href: "/school/health/medication", icon: Pill },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Record a sick-room visit</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={record} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <StudentPicker value={student} onChange={setStudent} />
              <Input label="Complaint *" placeholder="Headache, fever, injury…" value={form.complaint} onChange={set("complaint")} required />
            </div>
            {studentAllergy && (
              <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">Allergies: {studentAllergy}</div>
            )}
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="Temperature °C" type="number" step="0.1" min="30" max="45" value={form.temperature_c} onChange={set("temperature_c")} />
              <Input label="Medicine given" value={form.medicine_given} onChange={set("medicine_given")} />
              <Select label="Outcome" value={form.outcome} onChange={set("outcome")}>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {humanize(o)}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 pt-5 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={form.notify_parent || mustNotify}
                  disabled={mustNotify}
                  onChange={(e) => setForm({ ...form, notify_parent: e.target.checked })}
                />
                Notify parents
              </label>
            </div>
            <Textarea label="Treatment / notes" value={form.treatment} onChange={set("treatment")} />
            <Button type="submit" disabled={!student}>
              Save visit
            </Button>
          </form>
        </CardBody>
      </Card>

      <nav className="flex gap-1 border-b border-surface-border">
        {(["visits", "alerts", "immunizations"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t === "visits" ? "Visits" : t === "alerts" ? `Medical alerts (${alerts.length})` : `Vaccines due (${due.length})`}
          </button>
        ))}
      </nav>

      {tab === "visits" && (
        <Card>
          {/* The day being looked at belongs on the panel it filters, not
              floating above it. */}
          <CardHeader>
            <CardTitle>Visits</CardTitle>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </CardHeader>
          <Table head={["Time", "Student", "Complaint", "Given", "Outcome", ""]} empty={visits.length === 0 && "No visits on this day."}>
            {visits.map((v) => (
              <tr key={v.id}>
                <td className={td}>{new Date(v.visited_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td className={tdStrong}>
                  <Link href={`/school/health/students/${v.student_id}`} className="hover:underline">
                    {v.student_name}
                  </Link>
                  <div className="text-xs font-normal text-ink-subtle">{v.section_label}</div>
                </td>
                <td className={td}>
                  {v.complaint}
                  {v.temperature_c && <span className="text-ink-subtle"> · {v.temperature_c}°C</span>}
                </td>
                <td className={td}>{v.medicine_given ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={outcomeTone(v.outcome)}>{humanize(v.outcome)}</Badge>
                  {v.parent_notified && <div className="text-xs text-ink-subtle">parents notified</div>}
                </td>
                <td className="px-4 py-3 text-xs text-ink-subtle">{v.recorded_by_name}</td>
              </tr>
            ))}
          </Table>
          <PanelFooter
            left={`${visits.length} visit${visits.length === 1 ? "" : "s"} on ${day}`}
          />
        </Card>
      )}

      {tab === "alerts" && (
        <Card>
          <CardHeader>
            <CardTitle>Medical alerts</CardTitle>
          </CardHeader>
          <Table head={["Student", "Blood", "Allergies", "Conditions", "Medication", "Emergency"]} empty={alerts.length === 0 && "No medical alerts recorded."}>
            {alerts.map((a) => (
              <tr key={a.student_id}>
                <td className={tdStrong}>
                  <Link href={`/school/health/students/${a.student_id}`} className="hover:underline">
                    {a.student_name}
                  </Link>
                  <div className="text-xs font-normal text-ink-subtle">{a.section_label}</div>
                </td>
                <td className={td}>{a.blood_group ?? "—"}</td>
                <td className="px-4 py-3 text-danger">{a.allergies ?? "—"}</td>
                <td className={td}>{a.chronic_conditions ?? "—"}</td>
                <td className={td}>{a.current_medications ?? "—"}</td>
                <td className={td}>{a.emergency_contact_phone ?? "—"}</td>
              </tr>
            ))}
          </Table>
          <PanelFooter
            left={`${alerts.length} student${alerts.length === 1 ? "" : "s"} with something the school must know`}
          />
        </Card>
      )}

      {tab === "immunizations" && (
        <Card>
          <CardHeader>
            <CardTitle>Vaccines due</CardTitle>
          </CardHeader>
          <Table head={["Student", "Vaccine", "Dose", "Due"]} empty={due.length === 0 && "Nothing due in the next 30 days."}>
            {due.map((d) => (
              <tr key={d.id}>
                <td className={tdStrong}>
                  <Link href={`/school/health/students/${d.student_id}`} className="hover:underline">
                    {d.student_name}
                  </Link>
                  <div className="text-xs font-normal text-ink-subtle">{d.section_label}</div>
                </td>
                <td className={td}>{d.vaccine}</td>
                <td className={td}>{d.dose ?? "—"}</td>
                <td className={td}>{d.next_due_on}</td>
              </tr>
            ))}
          </Table>
          <PanelFooter left={`${due.length} due in the next 30 days`} />
        </Card>
      )}
    </div>
  );
}
