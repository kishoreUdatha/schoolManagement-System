"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { EnquiryFormModal } from "../EnquiryFormModal";
import {
  ActivityKind,
  AdmissionStage,
  EnquiryDetail,
  STAGES,
  label,
  selectClass,
  stageTone,
} from "../types";

type AcademicYear = { id: number; name: string; is_current: boolean };
type Section = { id: number; name: string; capacity: number };
type SchoolClass = { id: number; name: string; sections: Section[] };

type ConvertResult = {
  student_id: number;
  admission_no: string;
  parent_user_id: number | null;
  parent_temporary_password: string | null;
  parent_login_note: string | null;
};

const LOG_KINDS: ActivityKind[] = ["call", "visit", "whatsapp", "email", "note"];

export default function EnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);

  const [e, setE] = useState<EnquiryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<ConvertResult | null>(null);

  const [logKind, setLogKind] = useState<ActivityKind>("call");
  const [logNote, setLogNote] = useState("");
  const [logFollowUp, setLogFollowUp] = useState("");
  const [logging, setLogging] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<EnquiryDetail>(`/api/v1/school/admissions/enquiries/${id}`);
      setE(data);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function moveTo(stage: AdmissionStage) {
    if (stage === "lost") {
      setLosing(true);
      return;
    }
    if (stage === "enrolled") {
      setConverting(true);
      return;
    }
    try {
      const { data } = await api.post<EnquiryDetail>(
        `/api/v1/school/admissions/enquiries/${id}/stage`,
        { stage }
      );
      setE(data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function logActivity(ev: FormEvent) {
    ev.preventDefault();
    setLogging(true);
    try {
      const body: Record<string, string | null> = { kind: logKind, note: logNote };
      if (logFollowUp) body.next_follow_up_date = logFollowUp;
      const { data } = await api.post<EnquiryDetail>(
        `/api/v1/school/admissions/enquiries/${id}/activities`,
        body
      );
      setE(data);
      setLogNote("");
      setLogFollowUp("");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLogging(false);
    }
  }

  async function remove() {
    if (!e || !window.confirm(`Delete the enquiry for ${e.student_name}?`)) return;
    try {
      await api.delete(`/api/v1/school/admissions/enquiries/${id}`);
      router.push("/school/admissions");
    } catch (err) {
      setError(apiError(err));
    }
  }

  if (!e) {
    return (
      <div className="space-y-4">
        <Link href="/school/admissions" className="text-sm text-ink-muted hover:underline">
          ← Admissions
        </Link>
        {error ? (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        ) : (
          <div className="text-sm text-ink-muted">Loading…</div>
        )}
      </div>
    );
  }

  const closed = e.stage === "enrolled" || e.stage === "lost";

  return (
    <div className="space-y-6">
      <Link href="/school/admissions" className="text-sm text-ink-muted hover:underline">
        ← Admissions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">{e.student_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone={stageTone(e.stage)}>{label(e.stage)}</Badge>
            {e.applying_for_class && <span>for {e.applying_for_class}</span>}
            <span>· received {e.created_at.slice(0, 10)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {e.stage !== "enrolled" && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="danger" onClick={remove}>
                Delete
              </Button>
            </>
          )}
          {e.stage === "enrolled" && e.student_id && (
            <Link href={`/school/students/${e.student_id}`}>
              <Button>View student</Button>
            </Link>
          )}
          {!closed && <Button onClick={() => setConverting(true)}>Enrol student</Button>}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      {converted && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          <div className="font-semibold">Enrolled as {converted.admission_no}.</div>
          {converted.parent_temporary_password && (
            <div className="mt-1">
              Parent login created for {e.parent_email}. Temporary password:{" "}
              <code className="rounded bg-success-bg px-1.5 py-0.5 font-mono">
                {converted.parent_temporary_password}
              </code>{" "}
              (shown once — share it with the parent).
            </div>
          )}
          {converted.parent_login_note && <div className="mt-1">{converted.parent_login_note}</div>}
        </div>
      )}

      {e.stage !== "enrolled" && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase text-ink-subtle">Move to</span>
            {STAGES.filter((s) => s !== e.stage).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "lost" ? "ghost" : "secondary"}
                onClick={() => moveTo(s)}
              >
                {label(s)}
              </Button>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row k="Parent" v={e.parent_name} />
              <Row k="Phone" v={<a href={`tel:${e.parent_phone}`} className="hover:underline">{e.parent_phone}</a>} />
              <Row k="Email" v={e.parent_email} />
              <Row k="Date of birth" v={e.dob} />
              <Row k="Gender" v={e.gender && label(e.gender)} />
              <Row k="Previous school" v={e.previous_school} />
              <Row k="Address" v={e.address} />
              <Row k="Source" v={label(e.source)} />
              <Row k="Campaign" v={e.campaign_name} />
              <Row k="Assigned to" v={e.assigned_to_name} />
              <Row k="Next follow-up" v={e.next_follow_up_date} />
              {e.lost_reason && <Row k="Lost reason" v={e.lost_reason} />}
              {e.notes && <Row k="Notes" v={<span className="whitespace-pre-wrap">{e.notes}</span>} />}
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            {!closed && (
              <form onSubmit={logActivity} className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {LOG_KINDS.map((k) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setLogKind(k)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                        logKind === k
                          ? "bg-brand-500/15 text-brand-300 ring-brand-500/40"
                          : "bg-surface-subtle text-ink-muted ring-surface-border"
                      }`}
                    >
                      {label(k)}
                    </button>
                  ))}
                </div>
                <textarea
                  value={logNote}
                  onChange={(ev) => setLogNote(ev.target.value)}
                  placeholder="What happened? e.g. Called — parent visiting Saturday 10am"
                  rows={2}
                  required
                  className={`w-full ${selectClass}`}
                />
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    label="Next follow-up (optional)"
                    type="date"
                    value={logFollowUp}
                    onChange={(ev) => setLogFollowUp(ev.target.value)}
                  />
                  <Button type="submit" loading={logging}>
                    Log {label(logKind).toLowerCase()}
                  </Button>
                </div>
              </form>
            )}

            <ol className="space-y-3 border-l border-surface-border pl-4">
              {e.activities.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
                  <div className="text-xs text-ink-subtle">
                    {new Date(a.created_at).toLocaleString()} · {a.user_name ?? "Website form"}
                  </div>
                  <div className="text-sm text-ink">
                    {a.kind === "stage_change" ? (
                      <>
                        {a.from_stage ? (
                          <>
                            Moved {label(a.from_stage)} → <b>{label(a.to_stage ?? "")}</b>
                          </>
                        ) : (
                          <b>{a.note ?? "Created"}</b>
                        )}
                        {a.from_stage && a.note && (
                          <span className="text-ink-muted"> — {a.note}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <Badge>{label(a.kind)}</Badge>{" "}
                        <span className="whitespace-pre-wrap">{a.note}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      {editing && (
        <EnquiryFormModal
          existing={e}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
      {losing && (
        <LostModal
          id={id}
          onClose={() => setLosing(false)}
          onDone={(d) => {
            setLosing(false);
            setE(d);
          }}
        />
      )}
      {converting && (
        <ConvertModal
          enquiry={e}
          onClose={() => setConverting(false)}
          onDone={(r) => {
            setConverting(false);
            setConverted(r);
            load();
          }}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-ink-subtle">{k}</dt>
      <dd className="col-span-2 text-ink">{v || "—"}</dd>
    </div>
  );
}

function LostModal({
  id,
  onClose,
  onDone,
}: {
  id: number;
  onClose: () => void;
  onDone: (d: EnquiryDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post<EnquiryDetail>(
        `/api/v1/school/admissions/enquiries/${id}/stage`,
        { stage: "lost", lost_reason: reason }
      );
      onDone(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Mark as lost">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Reason *"
          placeholder="e.g. Chose another school, fees too high, relocated"
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
          required
        />
        {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            Mark lost
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConvertModal({
  enquiry,
  onClose,
  onDone,
}: {
  enquiry: EnquiryDetail;
  onClose: () => void;
  onDone: (r: ConvertResult) => void;
}) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | "">("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [createLogin, setCreateLogin] = useState(Boolean(enquiry.parent_email));
  const [relation, setRelation] = useState("guardian");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        if (cur) setYearId(cur.id);
      })
      .catch((err) => setError(apiError(err)));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setClassId("");
    setSectionId("");
    api
      .get<SchoolClass[]>("/api/v1/school/classes", { params: { academic_year_id: yearId } })
      .then((r) => {
        setClasses(r.data);
        // Pre-select the class whose name matches what the parent asked for.
        const want = (enquiry.applying_for_class ?? "").trim().toLowerCase();
        const match = want && r.data.find((c) => c.name.trim().toLowerCase() === want);
        if (match) setClassId(match.id);
      })
      .catch((err) => setError(apiError(err)));
  }, [yearId, enquiry.applying_for_class]);

  const sections = useMemo(
    () => classes.find((c) => c.id === classId)?.sections ?? [],
    [classes, classId]
  );

  useEffect(() => {
    if (sections.length === 1) setSectionId(sections[0].id);
  }, [sections]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ConvertResult>(
        `/api/v1/school/admissions/enquiries/${enquiry.id}/convert`,
        {
          academic_year_id: yearId,
          section_id: sectionId,
          admission_no: admissionNo.trim() || null,
          create_parent_login: createLogin,
          relation,
        }
      );
      onDone(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Enrol ${enquiry.student_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Creates the student record (with any one-time fees) and moves this enquiry to Enrolled.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Academic year *</span>
            <select
              value={yearId}
              onChange={(ev) => setYearId(Number(ev.target.value))}
              className={selectClass}
              required
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Class *</span>
            <select
              value={classId}
              onChange={(ev) => {
                setClassId(Number(ev.target.value));
                setSectionId("");
              }}
              className={selectClass}
              required
            >
              <option value="">Select</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Section *</span>
            <select
              value={sectionId}
              onChange={(ev) => setSectionId(Number(ev.target.value))}
              className={selectClass}
              required
            >
              <option value="">Select</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          label="Admission number"
          hint="Leave blank to auto-generate"
          value={admissionNo}
          onChange={(ev) => setAdmissionNo(ev.target.value)}
        />
        <div className="space-y-2 rounded-lg border border-surface-border p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={createLogin}
              disabled={!enquiry.parent_email}
              onChange={(ev) => setCreateLogin(ev.target.checked)}
            />
            Create parent login for {enquiry.parent_email ?? "— (no email on enquiry)"}
          </label>
          {createLogin && (
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              Relation
              <select
                value={relation}
                onChange={(ev) => setRelation(ev.target.value)}
                className={selectClass}
              >
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
                <option value="other">Other</option>
              </select>
            </label>
          )}
        </div>
        {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!sectionId}>
            Enrol
          </Button>
        </div>
      </form>
    </Modal>
  );
}
