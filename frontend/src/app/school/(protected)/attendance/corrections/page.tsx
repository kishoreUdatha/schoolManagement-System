"use client";

import { useCallback, useEffect, useState } from "react";

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
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { api, apiError } from "@/lib/api";
import { dateTime, shortDate, toIso } from "@/lib/dates";

type Correction = {
  id: number;
  student_id: number;
  student_name: string | null;
  admission_no: string | null;
  section_label: string | null;
  date: string;
  from_status: string | null;
  to_status: string;
  reason: string;
  status: string;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

const STATUSES = ["present", "absent", "late", "half_day"];

const stateTone = (s: string) =>
  s === "approved" ? "emerald" : s === "rejected" ? "rose" : "amber";

/** The queue for disputing an attendance mark.
 *
 *  Approving is the only thing in the module that moves the register, so a
 *  mark can never change without a reason and a second person attached to it.
 *  The API refuses when you try to decide your own request; the buttons stay
 *  visible and the refusal is shown, because who may decide depends on who is
 *  signed in and hiding them would just look broken.
 */
export default function AttendanceCorrectionsPage() {
  const [rows, setRows] = useState<Correction[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [deciding, setDeciding] = useState<Correction | null>(null);
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [form, setForm] = useState({
    student_id: "",
    date: toIso(new Date()),
    to_status: "present",
    reason: "",
  });

  const load = useCallback(() => {
    api
      .get<Correction[]>("/api/v1/school/attendance-ops/corrections", {
        params: { state: filter || undefined },
      })
      .then((r) => {
        // Pending first: the decided ones are history, the pending ones are work.
        const order = { pending: 0, approved: 1, rejected: 1 } as Record<string, number>;
        setRows(
          [...r.data].sort(
            (a, b) =>
              (order[a.status] ?? 2) - (order[b.status] ?? 2) ||
              b.created_at.localeCompare(a.created_at)
          )
        );
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post(
        `/api/v1/school/attendance-ops/corrections/${deciding.id}/decide`,
        { approve, note: note || null }
      );
      setSaved(
        approve
          ? "Approved — the register has been changed."
          : "Refused. The register is unchanged."
      );
      setDeciding(null);
      setNote("");
      load();
    } catch (e) {
      // Shown verbatim: the useful case is "somebody else has to agree".
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post("/api/v1/school/attendance-ops/corrections", {
        student_id: Number(form.student_id),
        date: form.date,
        to_status: form.to_status,
        reason: form.reason,
      });
      setSaved("Asked for. Somebody else has to agree before the register moves.");
      setAsking(false);
      setForm({ ...form, student_id: "", reason: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register corrections"
        subtitle="Asking for an attendance mark to change, and agreeing to it."
        actions={<Button onClick={() => setAsking(true)}>Ask for a correction</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting" value={pending} accent={pending ? "amber" : "emerald"} />
        <StatCard
          label="Approved"
          value={rows.filter((r) => r.status === "approved").length}
        />
        <StatCard
          label="Refused"
          value={rows.filter((r) => r.status === "rejected").length}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Corrections</CardTitle>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="State">
            <option value="">All</option>
            <option value="pending">Waiting</option>
            <option value="approved">Approved</option>
            <option value="rejected">Refused</option>
          </Select>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Student", "Day", "Change", "Reason", "Asked by", "State", ""]}
            empty={rows.length === 0 && "Nobody has asked for a correction yet."}
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={tdStrong}>
                  {c.student_name}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {c.admission_no}
                    {c.section_label ? ` · ${c.section_label}` : ""}
                  </span>
                </td>
                <td className={td}>{shortDate(c.date)}</td>
                <td className={td}>
                  {c.from_status ? humanize(c.from_status) : "Not marked"} →{" "}
                  <span className="font-bold text-ink">{humanize(c.to_status)}</span>
                </td>
                <td className={td}>{c.reason}</td>
                <td className={td}>
                  {c.requested_by ?? "—"}
                  <span className="block text-[11px] text-ink-subtle">
                    {dateTime(c.created_at)}
                  </span>
                </td>
                <td className={td}>
                  <Badge tone={stateTone(c.status)}>{humanize(c.status)}</Badge>
                  {c.decided_by && (
                    <span className="block text-[11px] text-ink-subtle">
                      by {c.decided_by}
                    </span>
                  )}
                  {c.decision_note && (
                    <span className="block text-[11px] text-ink-subtle">
                      {c.decision_note}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {c.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setDeciding(c);
                          setApprove(true);
                        }}
                      >
                        Agree
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeciding(c);
                          setApprove(false);
                        }}
                      >
                        Refuse
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={approve ? "Agree to this correction?" : "Refuse this correction?"}
      >
        {deciding && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              {deciding.student_name} on {shortDate(deciding.date)}:{" "}
              {deciding.from_status ? humanize(deciding.from_status) : "not marked"} →{" "}
              {humanize(deciding.to_status)}.
            </p>
            <p className="text-[13px] text-ink-muted">{deciding.reason}</p>
            {approve && (
              <NoticeBox>
                Agreeing changes the register. It is the only thing on this page that
                does.
              </NoticeBox>
            )}
            <Textarea
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeciding(null)}>
                Cancel
              </Button>
              <Button onClick={decide} loading={busy}>
                {approve ? "Agree" : "Refuse"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={asking} onClose={() => setAsking(false)} title="Ask for a correction">
        <div className="space-y-4">
          <StudentPicker
            value={picked}
            onChange={(s) => {
              setPicked(s);
              setForm({ ...form, student_id: s ? String(s.id) : "" });
            }}
          />
          <Input
            label="Day"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Select
            label="Should say"
            value={form.to_status}
            onChange={(e) => setForm({ ...form, to_status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Textarea
            label="Why the register is wrong"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              onClick={ask}
              loading={busy}
              disabled={!form.student_id || form.reason.trim().length < 3}
            >
              Ask
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
