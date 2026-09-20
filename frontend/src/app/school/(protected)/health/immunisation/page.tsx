"use client";

import { useCallback, useEffect, useState } from "react";
import { Syringe } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { daysLeft, readableDate, toIso } from "@/lib/dates";

type SchoolClass = { id: number; name: string; sections: { id: number; name: string }[] };
type Roster = { id: number; full_name: string; admission_no: string; roll_no: number | null };
type Page<T> = { items: T[]; total: number };
type Due = {
  student_id: number;
  full_name?: string;
  student_name?: string;
  admission_no?: string | null;
  vaccine: string;
  next_due_on: string | null;
  section_label?: string | null;
};
type Alert = {
  student_id: number;
  student_name: string;
  section_label: string | null;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
};
type Recorded = { student_id: number; student_name: string; admission_no: string };
type DriveResult = {
  vaccine: string;
  given_on: string;
  in_section: number;
  recorded: Recorded[];
  skipped: Recorded[];
  already_had_it: Recorded[];
};

/** Immunisation and allergy, with a drive recorded a room at a time.
 *
 *  Recording thirty children one form at a time is how a vaccination day ends
 *  with half the register missing, so the bulk entry takes the section and
 *  the absentees rather than the children.
 */
export default function ImmunisationPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [roster, setRoster] = useState<Roster[]>([]);
  const [due, setDue] = useState<Due[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DriveResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vaccine: "",
    dose: "",
    given_on: toIso(),
    next_due_on: "",
  });
  const [absent, setAbsent] = useState<number[]>([]);

  useEffect(() => {
    api
      .get<SchoolClass[]>("/api/v1/school/classes")
      .then((r) => setClasses(r.data))
      .catch(() => setClasses([]));
    api
      .get<Due[]>("/api/v1/school/health/immunizations-due", { params: { within_days: 365 } })
      .then((r) => setDue(r.data))
      .catch(() => setDue([]));
    api
      .get<Alert[]>("/api/v1/school/health/alerts")
      .then((r) => setAlerts(r.data))
      .catch(() => setAlerts([]));
  }, []);

  const loadRoster = useCallback(() => {
    if (!sectionId) {
      setRoster([]);
      return;
    }
    api
      .get<Page<Roster>>("/api/v1/school/students", {
        params: { section_id: sectionId, page_size: 200, status: "active" },
      })
      .then((r) => setRoster(r.data.items))
      .catch(() => setRoster([]));
  }, [sectionId]);

  useEffect(() => {
    loadRoster();
    setAbsent([]);
  }, [loadRoster]);

  const runDrive = async () => {
    if (!sectionId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<DriveResult>("/api/v1/school/wellbeing/immunisation/bulk", {
        section_id: sectionId,
        vaccine: form.vaccine,
        given_on: form.given_on,
        dose: form.dose || null,
        next_due_on: form.next_due_on || null,
        skip_student_ids: absent,
      });
      setResult(r.data);
      setOpen(false);
      api
        .get<Due[]>("/api/v1/school/health/immunizations-due", { params: { within_days: 365 } })
        .then((x) => setDue(x.data))
        .catch(() => undefined);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const overdue = due.filter((d) => d.next_due_on && (daysLeft(d.next_due_on) ?? 1) < 0);
  const withAllergies = alerts.filter((a) => a.allergies);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Immunisation and allergies"
        subtitle="What each child has had, what is due, and what the school must not give them."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Pick a section</option>
              {classes.flatMap((c) =>
                (c.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {c.name} {s.name}
                  </option>
                ))
              )}
            </Select>
            <Button disabled={!sectionId} onClick={() => setOpen(true)}>
              <Syringe className="mr-1.5 h-4 w-4" />
              Record a drive
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Doses due" value={due.length} accent={due.length ? "amber" : "emerald"} />
        <StatCard label="Overdue" value={overdue.length} accent={overdue.length ? "rose" : "emerald"} />
        <StatCard label="Children with allergies" value={withAllergies.length} />
        <StatCard label="In the chosen section" value={roster.length} />
      </div>

      {result && (
        <NoticeBox>
          {result.vaccine} on {readableDate(result.given_on)}: {result.recorded.length} of{" "}
          {result.in_section} recorded
          {result.skipped.length > 0 && `, ${result.skipped.length} absent`}
          {result.already_had_it.length > 0 &&
            `, ${result.already_had_it.length} already had it that day`}
          .
        </NoticeBox>
      )}

      {overdue.length > 0 && (
        <WarnBox>
          {overdue.length} dose{overdue.length === 1 ? " is" : "s are"} past their due date.
          A vaccination nobody chased is only noticed when a child is unwell.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Due and overdue</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Vaccine", "Due", "State"]}
            empty={due.length === 0 && "Nothing is due."}
          >
            {due.map((d, i) => {
              const left = daysLeft(d.next_due_on);
              return (
                <tr key={`${d.student_id}-${d.vaccine}-${i}`}>
                  <td className={tdStrong}>
                    {d.student_name ?? d.full_name}
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {d.admission_no}
                      {d.section_label ? ` · ${d.section_label}` : ""}
                    </span>
                  </td>
                  <td className={td}>{d.vaccine}</td>
                  <td className={td}>
                    {d.next_due_on ? readableDate(d.next_due_on) : "Not set"}
                  </td>
                  <td className={td}>
                    {left === null ? (
                      <span className="text-ink-subtle">—</span>
                    ) : left < 0 ? (
                      <Badge tone="rose">{Math.abs(left)} days late</Badge>
                    ) : left <= 30 ? (
                      <Badge tone="amber">in {left} days</Badge>
                    ) : (
                      <Badge tone="neutral">in {left} days</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allergies, conditions and regular medication</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Allergies", "Conditions", "Regular medication"]}
            empty={alerts.length === 0 && "Nothing recorded yet."}
          >
            {alerts.map((a) => (
              <tr key={a.student_id}>
                <td className={tdStrong}>
                  {a.student_name}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {a.section_label ?? "No section"}
                    {a.blood_group ? ` · ${a.blood_group}` : ""}
                  </span>
                </td>
                <td className={td}>
                  {a.allergies ? <Badge tone="rose">{a.allergies}</Badge> : "—"}
                </td>
                <td className={td}>{a.chronic_conditions ?? "—"}</td>
                <td className={td}>{a.current_medications ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Record a vaccination drive">
        <div className="space-y-4">
          <p className="text-[13px] text-ink-muted">
            Everybody in the section is recorded except the children you tick as absent.
            Tick before saving — a vaccination recorded for a child who never had it is
            the one mistake here that could hurt somebody.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Vaccine"
              value={form.vaccine}
              onChange={(e) => setForm({ ...form, vaccine: e.target.value })}
            />
            <Input
              label="Dose"
              value={form.dose}
              placeholder="1st, booster…"
              onChange={(e) => setForm({ ...form, dose: e.target.value })}
            />
            <Input
              label="Given on"
              type="date"
              value={form.given_on}
              onChange={(e) => setForm({ ...form, given_on: e.target.value })}
            />
            <Input
              label="Next due"
              type="date"
              value={form.next_due_on}
              onChange={(e) => setForm({ ...form, next_due_on: e.target.value })}
            />
          </div>

          <div>
            <p className="mb-2 text-[12px] font-bold text-ink-muted">
              Absent today ({absent.length} of {roster.length})
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-surface-border p-2">
              {roster.length === 0 && (
                <p className="text-[13px] text-ink-subtle">Nobody in this section.</p>
              )}
              {roster.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-[13px] text-ink-muted"
                >
                  <input
                    type="checkbox"
                    checked={absent.includes(s.id)}
                    onChange={(e) =>
                      setAbsent((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                      )
                    }
                  />
                  {s.roll_no ? `${s.roll_no}. ` : ""}
                  {s.full_name}
                  <span className="text-ink-subtle">· {s.admission_no}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runDrive} loading={busy} disabled={!form.vaccine.trim()}>
              Record {roster.length - absent.length} child
              {roster.length - absent.length === 1 ? "" : "ren"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
