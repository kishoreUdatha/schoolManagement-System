"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Table, Textarea, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Row = {
  section_id: number;
  section_label: string;
  date: string;
  marked: boolean;
  marked_count: number;
  status: "open" | "locked";
  marked_by_name: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
  reopened_by_name: string | null;
  reopen_reason: string | null;
  present: number;
  absent: number;
};

const base = "/api/v1/school/attendance/registers";
const today = () => new Date().toISOString().slice(0, 10);
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** The office's view of who has marked attendance, and the lock that stops
 *  teachers editing a day once it is settled. */
export function RegisterLocks() {
  const [day, setDay] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [reopen, setReopen] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Row[]>(base, { params: { date: day } })
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setNotice(null);
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  const marked = rows.filter((r) => r.marked).length;
  const locked = rows.filter((r) => r.status === "locked").length;
  const pending = rows.length - marked;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance registers"
        subtitle="Who has marked the register, and locking a day so it can't be changed afterwards."
        actions={
          <>
            <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
            <Button variant="secondary" onClick={() => setDay(today())}>
              Today
            </Button>
            <Button
              disabled={busy || marked === locked}
              onClick={() =>
                run(() => api.post(`${base}/lock-day`, null, { params: { date: day } }), `Locked every marked register for ${day}.`)
              }
            >
              Lock the day
            </Button>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Sections" value={rows.length} />
        <StatCard label="Marked" value={marked} accent="emerald" />
        <StatCard label="Not marked" value={pending} accent={pending ? "rose" : "emerald"} />
        <StatCard label="Locked" value={locked} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{day}</CardTitle>
        </CardHeader>
        <CardBody>
          <Table
            head={["Section", "Marked by", "Present", "Absent", "Status", ""]}
            empty={rows.length === 0 && "No sections for this school."}
          >
            {rows.map((r) => (
              <tr key={r.section_id}>
                <td className={tdStrong}>{r.section_label}</td>
                <td className={td}>
                  {r.marked ? (
                    <>
                      {r.marked_by_name ?? "—"}
                      <span className="block text-xs text-ink-subtle">{r.marked_count} students</span>
                    </>
                  ) : (
                    <Badge tone="rose">Not marked</Badge>
                  )}
                </td>
                <td className={td}>{r.marked ? r.present : "—"}</td>
                <td className={td}>{r.marked ? r.absent : "—"}</td>
                <td className={td}>
                  {r.status === "locked" ? (
                    <>
                      <Badge tone="brand">Locked</Badge>
                      <span className="block text-xs text-ink-subtle">
                        {r.locked_by_name ?? "—"} · {time(r.locked_at)}
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge tone="emerald">Open</Badge>
                      {r.reopen_reason && (
                        <span className="block text-xs text-ink-subtle">
                          Reopened by {r.reopened_by_name ?? "—"}: {r.reopen_reason}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className={td}>
                  {r.status === "locked" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setReopen(r);
                        setReason("");
                      }}
                    >
                      Reopen
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !r.marked}
                      onClick={() =>
                        run(
                          () => api.post(`${base}/lock`, { section_id: r.section_id, date: day }),
                          `${r.section_label} locked.`
                        )
                      }
                    >
                      Lock
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={reopen !== null} onClose={() => setReopen(null)} title={`Reopen ${reopen?.section_label ?? ""}`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reopen) return;
            const r = reopen;
            setReopen(null);
            run(
              () => api.post(`${base}/reopen`, { section_id: r.section_id, date: day, reason }),
              `${r.section_label} reopened — the class teacher can edit it again.`
            );
          }}
        >
          <p className="text-sm text-ink-muted">
            The class teacher will be able to change {day} again. The reason is kept against the register.
          </p>
          <Textarea
            label="Why is it being reopened?"
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Two students were marked absent by mistake"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReopen(null)}>
              Cancel
            </Button>
            <Button type="submit">Reopen</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
