"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type Template = {
  id: number;
  kind: string;
  name: string;
  title: string;
  body: string;
  serial_prefix: string;
  parent_can_request: boolean;
  is_active: boolean;
};

type Certificate = {
  id: number;
  kind: string;
  template_id: number | null;
  template_name: string | null;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  status: "requested" | "issued" | "rejected" | "cancelled";
  purpose: string | null;
  serial_no: string | null;
  issued_on: string | null;
  issued_by_name: string | null;
  requested_by_name: string | null;
  remarks: string | null;
  print_count: number;
  created_at: string;
};

const tone = { requested: "amber", issued: "emerald", rejected: "rose", cancelled: "neutral" } as const;

export default function CertificatesPage() {
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Certificate[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<{ request?: Certificate } | null>(null);
  const [rejecting, setRejecting] = useState<Certificate | null>(null);
  const [cancelling, setCancelling] = useState<Certificate | null>(null);

  async function load() {
    try {
      const [list, t] = await Promise.all([
        api.get<Certificate[]>("/api/v1/school/certificates", { params: status ? { status } : {} }),
        api.get<Template[]>("/api/v1/school/certificates/templates"),
      ]);
      setItems(list.data);
      setTemplates(t.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const requests = items.filter((c) => c.status === "requested");

  function print(c: Certificate) {
    openAuthed(`/api/v1/school/certificates/${c.id}/pdf`)
      .then(load)
      .catch((e) => setError(apiError(e)));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        subtitle="Bonafide, study, character and transfer certificates, with a numbered register."
        actions={
          <>
            <Link href="/school/certificates/templates">
              <Button variant="secondary">Templates</Button>
            </Link>
            <Button onClick={() => setIssuing({})}>+ Issue certificate</Button>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {requests.length > 0 && status !== "issued" && (
        <Card>
          <CardHeader>
            <CardTitle>Requests from parents · {requests.length}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <b className="text-ink">{r.template_name}</b> for {r.student_name} ({r.section_label}) — “{r.purpose}”
                  <div className="text-xs text-ink-subtle">
                    by {r.requested_by_name} on {r.created_at.slice(0, 10)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setIssuing({ request: r })}>
                    Issue
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="flex items-end gap-3">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="issued">Issued</option>
          <option value="requested">Requested</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>

      <Card>
        <Table head={["Serial", "Certificate", "Student", "Purpose", "Issued", "Status", ""]} empty={items.length === 0 && "Nothing in the register yet."}>
          {items.map((c) => (
            <tr key={c.id} className="hover:bg-surface-hover">
              <td className="px-3 py-2 font-mono text-xs text-ink">{c.serial_no ?? "—"}</td>
              <td className={tdStrong}>{c.template_name ?? humanize(c.kind)}</td>
              <td className={td}>
                {c.student_name}
                <div className="text-xs text-ink-subtle">
                  {c.admission_no} · {c.section_label}
                </div>
              </td>
              <td className={td}>{c.purpose ?? "—"}</td>
              <td className={td}>
                {c.issued_on ?? "—"}
                {c.issued_by_name && <div className="text-xs text-ink-subtle">{c.issued_by_name}</div>}
              </td>
              <td className="px-3 py-2">
                <Badge tone={tone[c.status]}>{c.status}</Badge>
                {c.remarks && <div className="max-w-xs text-xs text-ink-subtle">{c.remarks}</div>}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {(c.status === "issued" || c.status === "cancelled") && (
                  <Button size="sm" variant="secondary" onClick={() => print(c)}>
                    PDF{c.print_count > 0 && ` (${c.print_count})`}
                  </Button>
                )}
                {c.status === "issued" && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(c)}>
                    Cancel
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {issuing && (
        <IssueModal
          templates={templates.filter((t) => t.is_active)}
          request={issuing.request}
          onClose={() => setIssuing(null)}
          onDone={(c) => {
            setIssuing(null);
            setNotice(`Issued ${c.serial_no}.`);
            load();
            openAuthed(`/api/v1/school/certificates/${c.id}/pdf`).catch(() => undefined);
          }}
        />
      )}
      {rejecting && (
        <ReasonModal
          title="Reject request"
          label="Reason (shown to the parent) *"
          action="Reject"
          onClose={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await api.post(`/api/v1/school/certificates/${rejecting.id}/decide`, { approve: false, remarks: reason });
            setRejecting(null);
            load();
          }}
        />
      )}
      {cancelling && (
        <ReasonModal
          title={`Cancel ${cancelling.serial_no}`}
          label="Reason *"
          action="Cancel certificate"
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await api.post(`/api/v1/school/certificates/${cancelling.id}/cancel`, { reason });
            setCancelling(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ReasonModal({
  title,
  label,
  action,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  action: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSubmit(reason);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <Input label={label} value={reason} onChange={(e) => setReason(e.target.value)} required />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant="danger">
            {action}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function IssueModal({
  templates,
  request,
  onClose,
  onDone,
}: {
  templates: Template[];
  request?: Certificate;
  onClose: () => void;
  onDone: (c: Certificate) => void;
}) {
  const [templateId, setTemplateId] = useState(request?.template_id ? String(request.template_id) : "");
  const [student, setStudent] = useState<PickedStudent | null>(
    request ? { id: request.student_id, full_name: request.student_name, admission_no: request.admission_no } : null
  );
  const [purpose, setPurpose] = useState(request?.purpose ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const [tc, setTc] = useState({
    date_of_leaving: today,
    reason_for_leaving: "",
    last_class_studied: "",
    promoted_to: "",
    conduct: "Good",
    fees_paid_up_to: "",
    remarks: "",
    deactivate_student: true,
    allow_with_dues: false,
  });
  const [preview, setPreview] = useState<{ title: string; body: string; missing: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = templates.find((t) => String(t.id) === templateId);
  const isTc = template?.kind === "transfer";

  function tcPayload() {
    if (!isTc) return null;
    const n = (v: string) => (v.trim() ? v.trim() : null);
    return {
      ...tc,
      last_class_studied: n(tc.last_class_studied),
      promoted_to: n(tc.promoted_to),
      fees_paid_up_to: n(tc.fees_paid_up_to),
      remarks: n(tc.remarks),
    };
  }

  useEffect(() => {
    setPreview(null);
    if (!template || !student) return;
    if (isTc && tc.reason_for_leaving.trim().length < 2) return;
    const t = setTimeout(() => {
      api
        .post("/api/v1/school/certificates/preview", {
          template_id: template.id,
          student_id: student.id,
          purpose: purpose || null,
          tc: tcPayload(),
        })
        .then((r) => setPreview(r.data))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, student, purpose, tc]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!template || !student) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = request
        ? await api.post<Certificate>(`/api/v1/school/certificates/${request.id}/decide`, { approve: true, tc: tcPayload() })
        : await api.post<Certificate>("/api/v1/school/certificates", {
            template_id: template.id,
            student_id: student.id,
            purpose: purpose || null,
            tc: tcPayload(),
          });
      onDone(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const setT = (k: keyof typeof tc) => (e: { target: { value: string } }) => setTc({ ...tc, [k]: e.target.value });

  return (
    <Modal open onClose={onClose} title={request ? `Issue ${request.template_name}` : "Issue certificate"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Certificate *" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required disabled={!!request}>
            <option value="">Select</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {request ? (
            <Input label="Student" value={`${request.student_name} · ${request.admission_no}`} disabled />
          ) : (
            <StudentPicker value={student} onChange={setStudent} />
          )}
        </div>
        {!isTc && (
          <Input label="Purpose" placeholder="e.g. passport application" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={!!request} />
        )}
        {isTc && (
          <div className="grid gap-4 rounded-lg border border-surface-border p-3 sm:grid-cols-3">
            <Input label="Date of leaving *" type="date" value={tc.date_of_leaving} onChange={setT("date_of_leaving")} required />
            <div className="sm:col-span-2">
              <Input label="Reason for leaving *" value={tc.reason_for_leaving} onChange={setT("reason_for_leaving")} required />
            </div>
            <Input label="Last class studied" value={tc.last_class_studied} onChange={setT("last_class_studied")} />
            <Input label="Promoted to" value={tc.promoted_to} onChange={setT("promoted_to")} />
            <Input label="Conduct" value={tc.conduct} onChange={setT("conduct")} />
            <Input label="Fees paid up to" placeholder="e.g. March 2027" value={tc.fees_paid_up_to} onChange={setT("fees_paid_up_to")} />
            <div className="sm:col-span-2">
              <Input label="Remarks" value={tc.remarks} onChange={setT("remarks")} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted sm:col-span-3">
              <input type="checkbox" checked={tc.deactivate_student} onChange={(e) => setTc({ ...tc, deactivate_student: e.target.checked })} />
              Mark the student as left (inactive) and stop their transport
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted sm:col-span-3">
              <input type="checkbox" checked={tc.allow_with_dues} onChange={(e) => setTc({ ...tc, allow_with_dues: e.target.checked })} />
              Issue even if fees are pending
            </label>
          </div>
        )}
        {preview && (
          <Card className="bg-white p-5 text-slate-900">
            <div className="mb-3 text-center font-bold underline">{preview.title}</div>
            {preview.body.split("\n\n").map((p, i) => (
              <p key={i} className="mb-2 text-sm leading-relaxed">
                {p}
              </p>
            ))}
            {preview.missing.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Blank on the certificate: {preview.missing.map(humanize).join(", ")}. Fill these on the student or parent record first if needed.
              </p>
            )}
          </Card>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!template || !student}>
            Issue & print
          </Button>
        </div>
      </form>
    </Modal>
  );
}
