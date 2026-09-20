"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  Textarea,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";
import { openAuthed } from "@/lib/download";

type Doc = {
  id: number;
  category: string;
  file_name: string;
  size_bytes: number;
  is_verified: boolean;
  remark: string | null;
  verified_at: string | null;
};
type AppRow = {
  id: number;
  application_no: string;
  student_name: string;
  guardian_name: string;
  status: string;
  documents_total: number;
  documents_verified: number;
};
type AppDetail = AppRow & { documents: Doc[] };

type QueueItem = {
  doc: Doc;
  application: AppRow;
};

const base = "/api/v1/school/admissions/applications";

// The statuses where a document still matters. A rejected or withdrawn
// application's paperwork is nobody's job any more.
const LIVE = ["submitted", "verification", "assessment", "approved", "fee_pending"];

export default function DocumentVerificationPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(
        LIVE.map((s) => api.get<AppRow[]>(base, { params: { status: s } }))
      );
      const apps = lists.flatMap((r) => r.data);

      // Only applications with something outstanding are opened in full. The
      // list endpoint gives counts but not the documents themselves, so this
      // is one extra call each — kept to the few that actually need checking.
      const pending = apps.filter((a) => a.documents_verified < a.documents_total);
      const details = await Promise.all(
        pending.map((a) => api.get<AppDetail>(`${base}/${a.id}`).then((r) => r.data))
      );

      const items: QueueItem[] = [];
      for (const d of details) {
        for (const doc of d.documents) {
          if (!doc.is_verified) items.push({ doc, application: d });
        }
      }
      setQueue(items);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const verify = async (item: QueueItem) => {
    setBusy(item.doc.id);
    setError(null);
    try {
      await api.post(`${base}/documents/${item.doc.id}/verify`, { verified: true });
      setDone(`${humanize(item.doc.category)} accepted for ${item.application.student_name}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const reject = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!rejecting) return;
    setBusy(rejecting.doc.id);
    setError(null);
    try {
      // verified:false with a remark is how the API records a rejection — the
      // remark is what the family is told, so it is required here even though
      // the API would accept it empty.
      await api.post(`${base}/documents/${rejecting.doc.id}/verify`, {
        verified: false,
        remark,
      });
      setDone(`${humanize(rejecting.doc.category)} sent back for ${rejecting.application.student_name}.`);
      setRejecting(null);
      setRemark("");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const byApplication = queue.reduce<Record<number, QueueItem[]>>((acc, item) => {
    (acc[item.application.id] ??= []).push(item);
    return acc;
  }, {});
  const applications = Object.values(byApplication);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document verification"
        subtitle="Every document still waiting to be checked, across all live applications."
        actions={
          <Button variant="secondary" onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Documents waiting" value={loading ? "…" : queue.length} accent={queue.length ? "amber" : "emerald"} />
        <StatCard label="Applications affected" value={loading ? "…" : applications.length} />
        <StatCard
          label="Rejected, awaiting a replacement"
          value={loading ? "…" : queue.filter((q) => q.doc.remark).length}
        />
      </div>

      {!loading && queue.length === 0 && (
        <NoticeBox>Every document on a live application has been checked.</NoticeBox>
      )}

      {applications.map((items) => {
        const app = items[0].application;
        return (
          <Card key={app.id}>
            <CardHeader>
              <CardTitle>
                <Link href="/school/admissions/applications" className="hover:underline">
                  {app.student_name}
                </Link>
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-muted">{app.application_no}</span>
                <Badge tone="amber">{humanize(app.status)}</Badge>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <Table head={["Document", "File", "Note from a previous check", "", ""]}>
                {items.map((item) => (
                  <tr key={item.doc.id}>
                    <td className={tdStrong}>{humanize(item.doc.category)}</td>
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() =>
                          openAuthed(`${base}/documents/${item.doc.id}/file`, item.doc.file_name)
                        }
                        className="font-bold text-brand-600 hover:underline"
                      >
                        {item.doc.file_name}
                      </button>
                      <span className="block text-[11px] text-ink-subtle">
                        {Math.round(item.doc.size_bytes / 1024)} KB
                      </span>
                    </td>
                    <td className={td}>
                      {item.doc.remark ? (
                        <span className="text-[#B82E45]">{item.doc.remark}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td}>
                      <Button
                        size="sm"
                        loading={busy === item.doc.id}
                        onClick={() => verify(item)}
                      >
                        Accept
                      </Button>
                    </td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setRejecting(item);
                          setRemark(item.doc.remark ?? "");
                        }}
                      >
                        Send back
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>
        );
      })}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Send back the ${humanize(rejecting.doc.category).toLowerCase()}` : ""}
      >
        <form onSubmit={reject} className="space-y-4">
          <WarnBox>
            Say what is wrong with it. This note is the only thing the family has to
            go on when they try again.
          </WarnBox>
          <Textarea
            label="What needs fixing"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={3}
            required
            maxLength={300}
            placeholder="The scan cuts off the date of birth."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!remark.trim()}>
              Send back
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
