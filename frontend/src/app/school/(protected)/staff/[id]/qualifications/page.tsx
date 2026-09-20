"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";

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
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";
import { daysLeft, readableDate } from "@/lib/dates";

type Qualification = {
  id: number;
  qualification: string;
  institution: string | null;
  year_awarded: number | null;
  subject_area: string | null;
  document_id: number | null;
  document_title: string | null;
  verified_at: string | null;
  verified_by: string | null;
};
type Doc = {
  id: number;
  title: string;
  category: string;
  verification_status: string;
  expires_on: string | null;
};
type Page = {
  staff_id: number;
  full_name: string;
  employee_no: string;
  role: string;
  qualifications: Qualification[];
  unverified: number;
  documents: Doc[];
};

const BLANK = {
  qualification: "",
  institution: "",
  year_awarded: "",
  subject_area: "",
  document_id: "",
};

/** What a member of staff is qualified to do, and the paper that proves it.
 *
 *  A school is periodically asked to show that the person teaching physics is
 *  qualified to. Answering that from a paragraph somebody typed into a notes
 *  field means reading it, so each qualification is its own row and can be
 *  checked against its certificate.
 */
export default function QualificationsPage() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Page>(`/api/v1/school/staff-ops/${id}/qualifications`)
      .then((r) => setPage(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const add = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post(`/api/v1/school/staff-ops/${id}/qualifications`, {
        qualification: form.qualification.trim(),
        institution: form.institution.trim() || null,
        year_awarded: form.year_awarded ? Number(form.year_awarded) : null,
        subject_area: form.subject_area.trim() || null,
        document_id: form.document_id ? Number(form.document_id) : null,
      });
      setForm({ ...BLANK });
      setAdding(false);
      setSaved("Recorded. It stays unchecked until somebody verifies the certificate.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (q: Qualification, verified: boolean) => {
    setError(null);
    try {
      await api.post(`/api/v1/school/staff-ops/qualifications/${q.id}/verify`, {
        verified,
      });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const remove = async (q: Qualification) => {
    if (!window.confirm(`Remove ${q.qualification}?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/staff-ops/qualifications/${q.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const rows = page?.qualifications ?? [];

  return (
    <div className="space-y-6">
      <Link
        href={`/school/staff/${id}`}
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to the profile
      </Link>

      <PageHeader
        title={page ? `${page.full_name} — qualifications` : "Qualifications"}
        subtitle="What this person is qualified to do, and whether anyone has checked the certificate."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add one
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Recorded" value={rows.length} />
        <StatCard
          label="Not checked"
          value={page?.unverified ?? 0}
          accent={(page?.unverified ?? 0) > 0 ? "amber" : "emerald"}
        />
        <StatCard label="Documents on file" value={page?.documents.length ?? 0} />
      </div>

      {(page?.unverified ?? 0) > 0 && (
        <WarnBox>
          {page?.unverified} qualification(s) have not been checked against a
          certificate. Until somebody does, this is what the person told us rather
          than something the school can show an inspector.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Qualifications</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Qualification", "Institution", "Year", "Subject", "Certificate", "Checked", ""]}
            empty={rows.length === 0 && "Nothing recorded yet."}
          >
            {rows.map((q) => (
              <tr key={q.id}>
                <td className={tdStrong}>{q.qualification}</td>
                <td className={td}>{q.institution ?? "—"}</td>
                <td className={td}>{q.year_awarded ?? "—"}</td>
                <td className={td}>{q.subject_area ?? "—"}</td>
                <td className={td}>
                  {q.document_id ? (
                    <button
                      type="button"
                      className="font-bold text-brand-600 hover:underline"
                      onClick={() =>
                        openAuthed(`/api/v1/school/documents/${q.document_id}/file`)
                      }
                    >
                      {q.document_title ?? "Open"}
                    </button>
                  ) : (
                    <span className="text-ink-subtle">None attached</span>
                  )}
                </td>
                <td className={td}>
                  {q.verified_at ? (
                    <Badge tone="emerald">{q.verified_by ?? "Yes"}</Badge>
                  ) : (
                    <Badge tone="amber">Not yet</Badge>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => verify(q, !q.verified_at)}>
                      {q.verified_at ? "Undo check" : "Mark checked"}
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Remove ${q.qualification}`}
                      onClick={() => remove(q)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents on file</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Title", "Category", "State", "Expires"]}
            empty={(page?.documents.length ?? 0) === 0 && "Nothing uploaded yet."}
          >
            {(page?.documents ?? []).map((d) => {
              const left = daysLeft(d.expires_on);
              return (
                <tr key={d.id}>
                  <td className={tdStrong}>
                    <button
                      type="button"
                      className="font-bold text-brand-600 hover:underline"
                      onClick={() => openAuthed(`/api/v1/school/documents/${d.id}/file`)}
                    >
                      {d.title}
                    </button>
                  </td>
                  <td className={td}>{humanize(d.category)}</td>
                  <td className={td}>
                    <Badge tone={d.verification_status === "verified" ? "emerald" : "amber"}>
                      {humanize(d.verification_status)}
                    </Badge>
                  </td>
                  <td className={td}>
                    {d.expires_on ? (
                      <Badge
                        tone={
                          left !== null && left < 0
                            ? "rose"
                            : left !== null && left <= 30
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {readableDate(d.expires_on)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a qualification">
        <div className="space-y-4">
          <Input
            label="Qualification"
            placeholder="B.Ed"
            value={form.qualification}
            onChange={(e) => setForm({ ...form, qualification: e.target.value })}
          />
          <Input
            label="Institution"
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
          />
          <Input
            label="Year awarded"
            type="number"
            value={form.year_awarded}
            onChange={(e) => setForm({ ...form, year_awarded: e.target.value })}
          />
          <Input
            label="Subject area"
            placeholder="Mathematics"
            value={form.subject_area}
            onChange={(e) => setForm({ ...form, subject_area: e.target.value })}
          />
          <Select
            label="Certificate"
            value={form.document_id}
            onChange={(e) => setForm({ ...form, document_id: e.target.value })}
          >
            <option value="">No certificate attached</option>
            {(page?.documents ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
          <p className="text-[12px] text-ink-subtle">
            Only documents already uploaded against this person can be attached.
            Upload one from the documents page first if it is not listed.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={add} loading={busy} disabled={!form.qualification.trim()}>
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
