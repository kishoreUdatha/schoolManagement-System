"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime, readableDate } from "@/lib/dates";

type Assessment = {
  id: number;
  kind: string;
  scheduled_at: string;
  max_marks: string | null;
  marks_obtained: string | null;
  status: string;
  passed: boolean | null;
  remarks: string | null;
};
type AppRow = {
  id: number;
  application_no: string;
  student_name: string;
  dob: string | null;
  gender: string | null;
  guardian_name: string;
  phone: string;
  email: string | null;
  previous_school: string | null;
  sibling_in_school: boolean;
  class_id: number | null;
  class_name: string | null;
  applying_for_class: string | null;
  academic_year_id: number | null;
  status: string;
  submitted_at: string | null;
  documents_total: number;
  documents_verified: number;
  decision_note: string | null;
  student_id: number | null;
};
type AppDetail = AppRow & { assessments: Assessment[] };
type ClassRow = { id: number; name: string; sections: { id: number; name: string }[] };
type Year = { id: number; name: string; is_current: boolean };

const base = "/api/v1/school/admissions/applications";

// A decision is only meaningful once the family has actually applied.
const AWAITING = ["submitted", "verification", "assessment"];

export default function AdmissionDecisionsPage() {
  const [rows, setRows] = useState<AppDetail[]>([]);
  const [offered, setOffered] = useState<AppDetail[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);

  const [deciding, setDeciding] = useState<{ app: AppDetail; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [feeDue, setFeeDue] = useState(false);

  const [admitting, setAdmitting] = useState<AppDetail | null>(null);
  const [yearId, setYearId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [makeLogin, setMakeLogin] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(
        AWAITING.map((s) => api.get<AppRow[]>(base, { params: { status: s } }))
      );
      const waiting = lists.flatMap((r) => r.data);
      // The assessment result is the thing a decision turns on, and it only
      // comes back on the detail call — so these are opened in full.
      const details = await Promise.all(
        waiting.map((a) => api.get<AppDetail>(`${base}/${a.id}`).then((r) => r.data))
      );
      setRows(details);

      const offers = await Promise.all(
        ["approved", "fee_pending"].map((s) => api.get<AppRow[]>(base, { params: { status: s } }))
      );
      const offerDetails = await Promise.all(
        offers.flatMap((r) => r.data).map((a) => api.get<AppDetail>(`${base}/${a.id}`).then((r) => r.data))
      );
      setOffered(offerDetails);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api
      .get<Year[]>("/api/v1/school/academic-years")
      .then(async (r) => {
        setYears(r.data);
        const current = r.data.find((y) => y.is_current) ?? r.data[0];
        if (!current) return;
        setYearId(current.id);
        const cs = await api.get<ClassRow[]>("/api/v1/school/classes", {
          params: { academic_year_id: current.id },
        });
        setClasses(cs.data);
      })
      .catch(() => undefined);
  }, []);

  const openDecision = (app: AppDetail, approve: boolean) => {
    setDeciding({ app, approve });
    setNote("");
    setFeeDue(false);
    setError(null);
    setDone(null);
  };

  const decide = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!deciding) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/${deciding.app.id}/decide`, {
        approve: deciding.approve,
        note: note || null,
        application_fee_due: deciding.approve ? feeDue : false,
      });
      setDone(
        deciding.approve
          ? `${deciding.app.student_name} has been offered a place.`
          : `${deciding.app.student_name}'s application was rejected.`
      );
      setDeciding(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const openAdmit = (app: AppDetail) => {
    setAdmitting(app);
    setSectionId("");
    setAdmissionNo("");
    setMakeLogin(true);
    setError(null);
    setDone(null);
    if (app.academic_year_id) setYearId(app.academic_year_id);
  };

  const admit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!admitting || yearId === "" || sectionId === "") return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ admission_no: string; parent_temporary_password: string | null }>(
        `${base}/${admitting.id}/admit`,
        {
          academic_year_id: yearId,
          section_id: sectionId,
          admission_no: admissionNo || null,
          create_parent_login: makeLogin,
        }
      );
      setDone(
        `${admitting.student_name} admitted as ${r.data.admission_no}.` +
          (r.data.parent_temporary_password
            ? ` Parent password: ${r.data.parent_temporary_password} — it is shown once.`
            : "")
      );
      setAdmitting(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const sections = classes.flatMap((c) =>
    c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))
  );

  const latestTest = (a: AppDetail) =>
    [...a.assessments].sort((x, z) => z.scheduled_at.localeCompare(x.scheduled_at))[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admission decisions"
        subtitle="Everything needed to decide, on one screen — and the offers still waiting to be turned into students."
        actions={
          <Button variant="secondary" onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting a decision" value={loading ? "…" : rows.length} accent={rows.length ? "amber" : "emerald"} />
        <StatCard
          label="Documents all checked"
          value={loading ? "…" : rows.filter((a) => a.documents_total > 0 && a.documents_verified === a.documents_total).length}
        />
        <StatCard
          label="Assessed"
          value={loading ? "…" : rows.filter((a) => latestTest(a)?.status === "done").length}
        />
        <StatCard label="Offered, not admitted" value={loading ? "…" : offered.length} />
      </div>

      {rows.length === 0 && !loading && (
        <NoticeBox>No application is waiting on a decision.</NoticeBox>
      )}

      {rows.map((a) => {
        const test = latestTest(a);
        const docsDone = a.documents_total > 0 && a.documents_verified === a.documents_total;
        return (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.student_name}</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-muted">{a.application_no}</span>
                <Badge tone={a.status === "assessment" ? "brand" : "amber"}>{humanize(a.status)}</Badge>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">Applying for</div>
                  <div className="text-ink">{a.class_name ?? a.applying_for_class ?? "Not stated"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">Guardian</div>
                  <div className="text-ink">{a.guardian_name}</div>
                  <div className="text-[11px] text-ink-subtle">{a.phone}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">Date of birth</div>
                  <div className="text-ink">{a.dob ? readableDate(a.dob) : "Not given"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">Previous school</div>
                  <div className="text-ink">{a.previous_school ?? "None given"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone={docsDone ? "emerald" : "amber"}>
                  Documents {a.documents_verified} of {a.documents_total}
                </Badge>
                {test ? (
                  <Badge tone={test.passed === null ? "neutral" : test.passed ? "emerald" : "rose"}>
                    {humanize(test.kind)}:{" "}
                    {test.status === "done"
                      ? `${test.marks_obtained ?? "—"}${test.max_marks ? ` / ${test.max_marks}` : ""}`
                      : humanize(test.status)}
                  </Badge>
                ) : (
                  <Badge tone="neutral">No assessment</Badge>
                )}
                {a.sibling_in_school && <Badge tone="brand">Sibling already here</Badge>}
                {a.submitted_at && (
                  <Badge tone="neutral">Applied {readableDate(a.submitted_at.slice(0, 10))}</Badge>
                )}
              </div>

              {test?.remarks && (
                <p className="text-[13px] text-ink-muted">“{test.remarks}”</p>
              )}

              {!docsDone && (
                <WarnBox>
                  Not every document has been checked. You can still decide, but the
                  paperwork will be outstanding either way.
                </WarnBox>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openDecision(a, true)}>Approve</Button>
                <Button variant="danger" onClick={() => openDecision(a, false)}>
                  Reject
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Offered a place</CardTitle>
          <Badge tone="neutral">{offered.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Application", "Child", "Class", "Status", "Decision note", ""]}
            empty={offered.length === 0 && "Nobody is waiting to be admitted."}
          >
            {offered.map((a) => (
              <tr key={a.id}>
                <td className={td}>{a.application_no}</td>
                <td className={tdStrong}>{a.student_name}</td>
                <td className={td}>{a.class_name ?? a.applying_for_class ?? "—"}</td>
                <td className={td}>
                  <Badge tone={a.status === "fee_pending" ? "amber" : "brand"}>{humanize(a.status)}</Badge>
                </td>
                <td className={td}>{a.decision_note ?? "—"}</td>
                <td className={td}>
                  <Button size="sm" onClick={() => openAdmit(a)}>
                    Admit
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={
          deciding
            ? `${deciding.approve ? "Approve" : "Reject"} — ${deciding.app.student_name}`
            : ""
        }
      >
        <form onSubmit={decide} className="space-y-4">
          {deciding && !deciding.approve && (
            <WarnBox>
              The note is what the family is told. Write something they can act on or
              understand, rather than a code.
            </WarnBox>
          )}
          <Textarea
            label={deciding?.approve ? "Note (optional)" : "Reason"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required={deciding ? !deciding.approve : false}
            placeholder={
              deciding?.approve
                ? "Offered for Grade 1, starting April."
                : "No places left in the year group applied for."
            }
          />
          {deciding?.approve && (
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input type="checkbox" checked={feeDue} onChange={(e) => setFeeDue(e.target.checked)} />
              An admission fee is due before the place is confirmed
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={busy}
              variant={deciding?.approve ? "primary" : "danger"}
              disabled={deciding ? !deciding.approve && !note.trim() : true}
            >
              {deciding?.approve ? "Approve" : "Reject"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={admitting !== null}
        onClose={() => setAdmitting(null)}
        title={admitting ? `Admit ${admitting.student_name}` : ""}
      >
        <form onSubmit={admit} className="space-y-4">
          <Select
            label="Academic year"
            value={yearId}
            onChange={(e) => setYearId(Number(e.target.value))}
            required
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.is_current ? " (current)" : ""}
              </option>
            ))}
          </Select>
          <Select
            label="Class and section"
            value={sectionId}
            onChange={(e) => setSectionId(Number(e.target.value))}
            required
          >
            <option value="">Choose one</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          {sections.length === 0 && (
            <WarnBox>
              This year has no sections set up yet, so there is nowhere to put the
              child. Add a class and section first.
            </WarnBox>
          )}
          <Input
            label="Admission number"
            value={admissionNo}
            onChange={(e) => setAdmissionNo(e.target.value)}
            hint="Leave blank to let the school's numbering decide."
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input type="checkbox" checked={makeLogin} onChange={(e) => setMakeLogin(e.target.checked)} />
            Create a parent login as well
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdmitting(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={sectionId === ""}>
              Admit
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
