"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, Textarea, humanize, inr, td } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  FilterBar,
  MiniBar,
  PanelFooter,
  PersonCell,
  SearchBox,
  StatStrip,
} from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

/** A select sized for the filter bar: the same height as the search box. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Doc = { id: number; category: string; file_name: string; size_bytes: number; is_verified: boolean; remark: string | null };
type Assessment = {
  id: number;
  kind: string;
  scheduled_at: string;
  venue: string | null;
  assessor_name: string | null;
  max_marks: string | null;
  marks_obtained: string | null;
  status: "scheduled" | "done" | "absent" | "cancelled";
  passed: boolean | null;
  remarks: string | null;
};
type History = { from_status: string | null; to_status: string; note: string | null; changed_by_name: string | null; changed_at: string };
type Application = {
  id: number;
  application_no: string;
  enquiry_id: number | null;
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_id: number | null;
  class_name: string | null;
  student_name: string;
  dob: string | null;
  gender: string | null;
  previous_school: string | null;
  sibling_in_school: boolean;
  category: string | null;
  father_name: string | null;
  mother_name: string | null;
  guardian_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  submitted_at: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  application_fee: string | null;
  fee_paid_on: string | null;
  fee_receipt_no: string | null;
  student_id: number | null;
  documents_total: number;
  documents_verified: number;
  documents: Doc[];
  assessments: Assessment[];
  history: History[];
};
type Staff = { user_id: number; full_name: string };
type ClassRow = { id: number; name: string; sections: { id: number; name: string }[] };

const base = "/api/v1/school/admissions/applications";
const STATUSES = ["draft", "submitted", "verification", "assessment", "approved", "fee_pending", "admitted", "rejected", "withdrawn"];
const tone: Record<string, "neutral" | "amber" | "brand" | "emerald" | "rose"> = {
  draft: "neutral", submitted: "amber", verification: "amber", assessment: "brand",
  approved: "brand", fee_pending: "amber", admitted: "emerald", rejected: "rose", withdrawn: "neutral",
};
const DOC_KINDS = ["birth_certificate", "aadhaar", "photo", "address_proof", "transfer_certificate", "previous_marksheet", "medical", "caste_certificate", "other"];
const today = () => new Date().toISOString().slice(0, 10);
const localInput = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function Applications({ canDecide }: { canDecide: boolean }) {
  const [items, setItems] = useState<Application[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Application | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [years, setYears] = useState<{ id: number; name: string; is_current: boolean }[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [f, setF] = useState({ student_name: "", dob: "", gender: "", class_id: "", academic_year_id: "", guardian_name: "", phone: "", email: "", father_name: "", mother_name: "", previous_school: "", category: "", address: "", notes: "", sibling_in_school: false });
  const [testOpen, setTestOpen] = useState(false);
  const [tf, setTf] = useState({ kind: "written_test", scheduled_at: localInput(), venue: "", assessor_user_id: "", max_marks: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (search) params.search = search;
    api.get<Application[]>(base, { params }).then((r) => setItems(r.data)).catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search]);

  useEffect(() => {
    api.get<Staff[]>("/api/v1/school/directory/staff").then((r) => setStaff(r.data)).catch(() => setStaff([]));
    api
      .get<{ id: number; name: string; is_current: boolean }[]>("/api/v1/school/academic-years")
      .then(async (y) => {
        setYears(y.data);
        const cur = y.data.find((x) => x.is_current) ?? y.data[0];
        if (!cur) return;
        setF((prev) => ({ ...prev, academic_year_id: String(cur.id) }));
        const cs = await api.get<ClassRow[]>("/api/v1/school/classes", { params: { academic_year_id: cur.id } });
        setClasses(cs.data);
      })
      .catch(() => setClasses([]));
  }, []);

  const open = async (a: Application) => {
    try {
      const r = await api.get<Application>(`${base}/${a.id}`);
      setDetail(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  async function run(fn: () => Promise<{ data?: Application } | unknown>, done: string) {
    try {
      const r = (await fn()) as { data?: Application };
      setNotice(done);
      setError(null);
      load();
      if (detail && r?.data && (r.data as Application).id === detail.id) setDetail(r.data as Application);
      else if (detail) await open(detail);
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...f,
      class_id: f.class_id ? Number(f.class_id) : null,
      academic_year_id: f.academic_year_id ? Number(f.academic_year_id) : null,
      dob: f.dob || null,
      gender: f.gender || null,
      email: f.email || null,
      father_name: f.father_name || null,
      mother_name: f.mother_name || null,
      previous_school: f.previous_school || null,
      category: f.category || null,
      address: f.address || null,
      notes: f.notes || null,
    };
    const ok = await run(() => api.post(base, body), "Application saved as a draft.");
    if (ok) setFormOpen(false);
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !detail) return;
    const category = window.prompt(`Document type (${DOC_KINDS.join(", ")})`, "birth_certificate");
    if (!category) return;
    const form = new FormData();
    form.append("file", files[0]);
    form.append("category", category);
    await run(() => api.post(`${base}/${detail.id}/documents`, form, { timeout: 120_000 }), "Document uploaded.");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function schedule(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const ok = await run(
      () =>
        api.post<Application>(`${base}/${detail.id}/assessments`, {
          kind: tf.kind,
          scheduled_at: new Date(tf.scheduled_at).toISOString(),
          venue: tf.venue.trim() || null,
          assessor_user_id: tf.assessor_user_id ? Number(tf.assessor_user_id) : null,
          max_marks: tf.max_marks || null,
        }),
      "Assessment scheduled."
    );
    if (ok) setTestOpen(false);
  }

  const result = (t: Assessment) => {
    const marks = window.prompt(`Marks out of ${t.max_marks ? Number(t.max_marks) : "?"} (blank if absent)`, t.marks_obtained ?? "");
    if (marks === null) return;
    const attended = marks !== "";
    const passed = attended ? window.confirm("Passed? OK = yes, Cancel = no") : null;
    const remarks = window.prompt("Remarks", t.remarks ?? "") ?? "";
    run(
      () =>
        api.put(`${base}/assessments/${t.id}`, {
          status: attended ? "done" : "absent",
          marks_obtained: attended ? marks : null,
          passed,
          remarks: remarks || null,
        }),
      "Result recorded."
    );
  };

  const admit = (a: Application) => {
    const cls = classes.find((c) => c.id === a.class_id) ?? classes[0];
    if (!cls?.sections.length) {
      setError("Set up classes and sections before admitting.");
      return;
    }
    const sectionName = window.prompt(`Section for ${cls.name} (${cls.sections.map((s) => s.name).join(", ")})`, cls.sections[0].name);
    if (!sectionName) return;
    const section = cls.sections.find((s) => s.name.toLowerCase() === sectionName.trim().toLowerCase());
    if (!section) {
      setError(`No section called "${sectionName}" in ${cls.name}.`);
      return;
    }
    const admission_no = window.prompt("Admission number (blank = generated)", "") || null;
    run(async () => {
      const r = await api.post<{ admission_no: string; parent_temporary_password: string | null; parent_login_note: string | null }>(
        `${base}/${a.id}/admit`,
        { academic_year_id: a.academic_year_id ?? Number(f.academic_year_id), section_id: section.id, admission_no, create_parent_login: true }
      );
      window.alert(
        `Admitted as ${r.data.admission_no}.` +
          (r.data.parent_temporary_password ? `\n\nParent login: ${a.email}\nTemporary password: ${r.data.parent_temporary_password}` : "") +
          (r.data.parent_login_note ? `\n\n${r.data.parent_login_note}` : "")
      );
    }, "Student created.").then(() => setDetail(null));
  };

  const admitted = items.filter((a) => a.status === "admitted").length;
  const rejected = items.filter((a) => a.status === "rejected").length;
  const inProgress = items.filter(
    (a) => !["admitted", "rejected", "withdrawn"].includes(a.status)
  ).length;

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {/* Counted from the list already on screen — there is no summary
          endpoint behind these, so they describe the rows below and say so. */}
      <StatStrip
        stats={[
          { label: "Applications", value: items.length, note: "matching this filter" },
          { label: "In progress", value: inProgress, note: "not yet decided" },
          { label: "Admitted", value: admitted, note: "in this list" },
          { label: "Rejected", value: rejected, note: "in this list" },
        ]}
      />

      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Name, number or phone"
          label="Search applications"
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={filterSelect}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <Button onClick={() => setFormOpen(true)}>New application</Button>
      </FilterBar>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Applications</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[status ? humanize(status) : "Every stage", search ? `“${search}”` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </CardHeader>
        <Table head={["Number", "Applicant", "Class", "Documents", "Status", ""]} empty={items.length === 0 && "No applications."}>
          {items.map((a) => (
            <tr key={a.id}>
              <td className={td}>
                {a.application_no}
                {a.submitted_at && <div className="text-xs text-ink-subtle">{new Date(a.submitted_at).toLocaleDateString()}</div>}
              </td>
              <td className="px-4 py-3">
                <PersonCell
                  name={a.student_name}
                  sub={`${a.guardian_name} · ${a.phone}${a.sibling_in_school ? " · sibling here" : ""}`}
                />
              </td>
              <td className={td}>{a.class_name ?? "—"}</td>
              <td className={td}>
                <div className="text-[11px] text-ink-muted">
                  {a.documents_verified}/{a.documents_total} verified
                </div>
                {a.documents_total > 0 && (
                  <MiniBar percent={(a.documents_verified / a.documents_total) * 100} />
                )}
              </td>
              <td className={td}>
                <Badge tone={tone[a.status]}>{humanize(a.status)}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="secondary" onClick={() => open(a)}>
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${items.length} application${items.length === 1 ? "" : "s"} shown`}
          right={`${inProgress} awaiting a decision`}
        />
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.student_name} · ${detail.application_no}` : ""} size="lg">
        {detail && (
          <div className="max-h-[75vh] space-y-4 overflow-auto">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={tone[detail.status]}>{humanize(detail.status)}</Badge>
              <span className="text-ink-muted">
                {detail.class_name ?? "—"}
                {detail.academic_year_name && ` · ${detail.academic_year_name}`} · {detail.guardian_name} · {detail.phone}
                {detail.email && ` · ${detail.email}`}
              </span>
            </div>
            <div className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
              {detail.dob && <div>Born {detail.dob}</div>}
              {detail.gender && <div>{humanize(detail.gender)}</div>}
              {detail.father_name && <div>Father: {detail.father_name}</div>}
              {detail.mother_name && <div>Mother: {detail.mother_name}</div>}
              {detail.previous_school && <div>From {detail.previous_school}</div>}
              {detail.category && <div>Category: {detail.category}</div>}
              {detail.address && <div className="sm:col-span-2">{detail.address}</div>}
              {detail.application_fee && (
                <div className="sm:col-span-2">
                  Fee {inr(detail.application_fee)}
                  {detail.fee_paid_on ? ` paid ${detail.fee_paid_on}${detail.fee_receipt_no ? ` (${detail.fee_receipt_no})` : ""}` : " due"}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {detail.status === "draft" && (
                <Button size="sm" onClick={() => run(() => api.post<Application>(`${base}/${detail.id}/submit`), "Submitted.")}>
                  Submit
                </Button>
              )}
              {detail.status === "submitted" && (
                <Button size="sm" onClick={() => run(() => api.post<Application>(`${base}/${detail.id}/status`, { status: "verification" }), "Now checking documents.")}>
                  Start checking documents
                </Button>
              )}
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => upload(e.target.files)} />
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                Upload document
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setTestOpen(true)}>
                Schedule assessment
              </Button>
              {canDecide && ["verification", "assessment"].includes(detail.status) && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      const note = window.prompt("Note (optional)", "") ?? "";
                      const feeDue = window.confirm("Ask for the admission fee before admitting? OK = yes");
                      run(() => api.post<Application>(`${base}/${detail.id}/decide`, { approve: true, note: note || null, application_fee_due: feeDue }), "Approved.");
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const note = window.prompt("Why is it rejected? (required)", "");
                      if (!note) return;
                      run(() => api.post<Application>(`${base}/${detail.id}/decide`, { approve: false, note }), "Rejected.");
                    }}
                  >
                    Reject
                  </Button>
                </>
              )}
              {["approved", "fee_pending"].includes(detail.status) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const amount = window.prompt("Admission fee received", detail.application_fee ? String(Number(detail.application_fee)) : "");
                    if (!amount) return;
                    const receipt = window.prompt("Receipt number", detail.fee_receipt_no ?? "") ?? "";
                    run(() => api.post<Application>(`${base}/${detail.id}/fee`, { amount, paid_on: today(), receipt_no: receipt || null }), "Fee recorded.");
                  }}
                >
                  Record fee
                </Button>
              )}
              {canDecide && ["approved", "fee_pending"].includes(detail.status) && (
                <Button size="sm" onClick={() => admit(detail)}>
                  Admit
                </Button>
              )}
              {!["admitted", "withdrawn"].includes(detail.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const note = window.prompt("Why are they withdrawing?", "") ?? "";
                    run(() => api.post<Application>(`${base}/${detail.id}/withdraw?note=${encodeURIComponent(note)}`), "Withdrawn.");
                  }}
                >
                  Withdraw
                </Button>
              )}
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-ink">Documents</div>
              {detail.documents.length === 0 && <p className="text-sm text-ink-subtle">Nothing uploaded yet.</p>}
              <ul className="divide-y divide-surface-border text-sm">
                {detail.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="text-ink">{humanize(d.category)}</span>
                    <button type="button" className="text-brand-500 hover:underline" onClick={() => openAuthed(`${base}/documents/${d.id}/file`, d.file_name)}>
                      {d.file_name}
                    </button>
                    {d.is_verified ? <Badge tone="emerald">verified</Badge> : <Badge tone="amber">to check</Badge>}
                    {d.remark && <span className="text-xs text-ink-subtle">{d.remark}</span>}
                    <span className="ml-auto flex gap-2 text-xs">
                      {!d.is_verified && (
                        <button
                          type="button"
                          className="text-brand-500 hover:underline"
                          onClick={() => {
                            const remark = window.prompt("Note (optional)", "") ?? "";
                            run(() => api.post(`${base}/documents/${d.id}/verify`, { verified: true, remark: remark || null }), "Document verified.");
                          }}
                        >
                          Verify
                        </button>
                      )}
                      <button type="button" className="text-danger hover:underline" onClick={() => window.confirm("Delete this document?") && run(() => api.delete(`${base}/documents/${d.id}`), "Deleted.")}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-ink">Assessments</div>
              {detail.assessments.length === 0 && <p className="text-sm text-ink-subtle">None scheduled.</p>}
              <ul className="divide-y divide-surface-border text-sm">
                {detail.assessments.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="text-ink">{humanize(t.kind)}</span>
                    <span className="text-xs text-ink-subtle">
                      {new Date(t.scheduled_at).toLocaleString()}
                      {t.venue && ` · ${t.venue}`}
                      {t.assessor_name && ` · ${t.assessor_name}`}
                    </span>
                    <Badge tone={t.status === "done" ? (t.passed ? "emerald" : "rose") : t.status === "absent" ? "rose" : "brand"}>
                      {t.status === "done" ? (t.passed ? "passed" : "not passed") : humanize(t.status)}
                    </Badge>
                    {t.marks_obtained && (
                      <span className="text-ink-muted">
                        {Number(t.marks_obtained)}
                        {t.max_marks && `/${Number(t.max_marks)}`}
                      </span>
                    )}
                    {t.remarks && <span className="text-xs text-ink-subtle">{t.remarks}</span>}
                    {t.status === "scheduled" && (
                      <span className="ml-auto flex gap-2 text-xs">
                        <button type="button" className="text-brand-500 hover:underline" onClick={() => result(t)}>
                          Record result
                        </button>
                        <button type="button" className="text-danger hover:underline" onClick={() => run(() => api.delete(`${base}/assessments/${t.id}`), "Removed.")}>
                          Remove
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-ink">History</div>
              <ul className="space-y-1 text-xs text-ink-muted">
                {detail.history.map((h, i) => (
                  <li key={i}>
                    {new Date(h.changed_at).toLocaleString()} · {h.from_status ? `${humanize(h.from_status)} → ` : ""}
                    <b className="text-ink">{humanize(h.to_status)}</b>
                    {h.changed_by_name && ` · ${h.changed_by_name}`}
                    {h.note && ` · ${h.note}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New application" size="lg">
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Student's name *" value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} required minLength={2} />
            <Input label="Date of birth" type="date" max={today()} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />
            <Select label="Gender" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
            <Select label="Academic year" value={f.academic_year_id} onChange={(e) => setF({ ...f, academic_year_id: e.target.value })}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
            <Select label="Applying for" value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input label="Previous school" value={f.previous_school} onChange={(e) => setF({ ...f, previous_school: e.target.value })} />
            <Input label="Guardian *" value={f.guardian_name} onChange={(e) => setF({ ...f, guardian_name: e.target.value })} required minLength={2} />
            <Input label="Phone *" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required minLength={6} />
            <Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <Input label="Father's name" value={f.father_name} onChange={(e) => setF({ ...f, father_name: e.target.value })} />
            <Input label="Mother's name" value={f.mother_name} onChange={(e) => setF({ ...f, mother_name: e.target.value })} />
            <Input label="Category / quota" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </div>
          <Textarea label="Address" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <Textarea label="Notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.sibling_in_school} onChange={(e) => setF({ ...f, sibling_in_school: e.target.checked })} />
            Has a brother or sister in the school
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save draft</Button>
          </div>
        </form>
      </Modal>

      <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Schedule an assessment">
        <form onSubmit={schedule} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Type" value={tf.kind} onChange={(e) => setTf({ ...tf, kind: e.target.value })}>
              {["written_test", "interaction", "interview", "audition", "other"].map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
            </Select>
            <Input label="When *" type="datetime-local" value={tf.scheduled_at} onChange={(e) => setTf({ ...tf, scheduled_at: e.target.value })} required />
            <Input label="Where" value={tf.venue} onChange={(e) => setTf({ ...tf, venue: e.target.value })} />
            <Input label="Out of (marks)" type="number" min={1} value={tf.max_marks} onChange={(e) => setTf({ ...tf, max_marks: e.target.value })} />
            <Select label="Who will assess" value={tf.assessor_user_id} onChange={(e) => setTf({ ...tf, assessor_user_id: e.target.value })}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTestOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Schedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
