"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

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
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime, readableDate } from "@/lib/dates";

type Item = {
  id: number;
  area: string;
  is_cleared: boolean;
  cleared_by: string | null;
  cleared_at: string | null;
  note: string | null;
};
type Clearance = {
  id: number;
  staff_id: number;
  staff_name: string | null;
  employee_no: string | null;
  last_working_day: string | null;
  reason: string | null;
  status: string;
  initiated_by: string | null;
  completed_at: string | null;
  items: Item[];
  outstanding: string[];
  outstanding_count: number;
  can_complete: boolean;
  is_active: boolean | null;
};

/** Somebody leaving, and who still has to sign off.
 *
 *  Switching off an account already worked. What was missing is the part that
 *  happens before it: the laptop, the library books, the store-room key. A
 *  school that deactivates without them finds out six months later.
 */
export default function ExitClearancePage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Clearance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ last_working_day: "", reason: "" });
  const [clearing, setClearing] = useState<Item | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Clearance | null>(`/api/v1/school/staff-ops/${id}/exit`)
      .then((r) => {
        setC(r.data);
        setLoaded(true);
      })
      .catch((e) => {
        setError(apiError(e));
        setLoaded(true);
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Clearance>("/api/v1/school/staff-ops/clearances", {
        staff_id: Number(id),
        last_working_day: form.last_working_day || null,
        reason: form.reason.trim() || null,
      });
      setC(r.data);
      setStarting(false);
      setSaved("Checklist started. Every area has to sign off before it can close.");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const clearItem = async (cleared: boolean) => {
    if (!clearing) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Clearance>(
        `/api/v1/school/staff-ops/clearances/items/${clearing.id}`,
        { cleared, note: note.trim() || null }
      );
      setC(r.data);
      setClearing(null);
      setNote("");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!c) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await api.post<Clearance>(
        `/api/v1/school/staff-ops/clearances/${c.id}/complete`,
        { deactivate: true }
      );
      setC(r.data);
      setSaved("Marked complete, and the login has been switched off.");
    } catch (e) {
      // The API refuses while anything is outstanding and names what — show it.
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!c || !window.confirm("Cancel this departure?")) return;
    setError(null);
    try {
      const r = await api.post<Clearance>(
        `/api/v1/school/staff-ops/clearances/${c.id}/cancel`
      );
      setC(r.data);
      setSaved("Cancelled. Nothing was switched off.");
    } catch (e) {
      setError(apiError(e));
    }
  };

  const open = c?.status === "in_progress";
  const cleared = (c?.items ?? []).filter((i) => i.is_cleared).length;

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
        title={c ? `${c.staff_name ?? "Staff member"} — leaving` : "Leaving"}
        subtitle="Who still has to sign off before this person's account is closed."
        actions={
          open && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={cancel}>
                They are staying
              </Button>
              <Button onClick={complete} loading={busy} disabled={!c?.can_complete}>
                Complete
              </Button>
            </div>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {loaded && !c && (
        <Card>
          <CardBody className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              No departure has been started for this person.
            </p>
            <Button onClick={() => setStarting(true)}>Start a leaving checklist</Button>
          </CardBody>
        </Card>
      )}

      {c && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Areas signed off" value={`${cleared} / ${c.items.length}`} />
            <StatCard
              label="Still outstanding"
              value={c.outstanding_count}
              accent={c.outstanding_count ? "amber" : "emerald"}
            />
            <StatCard
              label="Last working day"
              value={c.last_working_day ? readableDate(c.last_working_day) : "Not set"}
            />
            <StatCard
              label="Account"
              value={c.is_active ? "Active" : "Switched off"}
            />
          </div>

          {c.outstanding_count > 0 && open && (
            <WarnBox>
              Still waiting on {c.outstanding.map(humanize).join(", ")}. This
              departure cannot be completed until each of them has signed off —
              a checklist nobody has to finish is the same as no checklist.
            </WarnBox>
          )}

          {c.status === "complete" && (
            <NoticeBox>
              Completed{c.completed_at ? ` on ${dateTime(c.completed_at)}` : ""}. The
              record and everything this person did is kept.
            </NoticeBox>
          )}
          {c.status === "cancelled" && (
            <NoticeBox>This departure was cancelled. Nothing was switched off.</NoticeBox>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Sign-offs</CardTitle>
              <Badge
                tone={
                  c.status === "complete"
                    ? "emerald"
                    : c.status === "cancelled"
                      ? "neutral"
                      : "amber"
                }
              >
                {humanize(c.status)}
              </Badge>
            </CardHeader>
            <CardBody className="p-0">
              <Table head={["Area", "Cleared", "By", "When", "Note", ""]}>
                {c.items.map((i) => (
                  <tr key={i.id}>
                    <td className={tdStrong}>{humanize(i.area)}</td>
                    <td className={td}>
                      {i.is_cleared ? (
                        <Badge tone="emerald">Yes</Badge>
                      ) : (
                        <Badge tone="amber">Waiting</Badge>
                      )}
                    </td>
                    <td className={td}>{i.cleared_by ?? "—"}</td>
                    <td className={td}>{i.cleared_at ? dateTime(i.cleared_at) : "—"}</td>
                    <td className={td}>{i.note ?? "—"}</td>
                    <td className={td}>
                      {open && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setClearing(i);
                            setNote(i.note ?? "");
                          }}
                        >
                          {i.is_cleared ? "Undo" : "Sign off"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>

          {c.reason && (
            <Card>
              <CardHeader>
                <CardTitle>Reason given</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-[13px] text-ink-muted">{c.reason}</p>
              </CardBody>
            </Card>
          )}
        </>
      )}

      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title="Start a leaving checklist"
      >
        <div className="space-y-4">
          <Input
            label="Last working day"
            type="date"
            value={form.last_working_day}
            onChange={(e) => setForm({ ...form, last_working_day: e.target.value })}
          />
          <Textarea
            label="Reason"
            rows={3}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <p className="text-[12px] text-ink-subtle">
            Every area gets a row, including ones that may not apply. Saying
            &ldquo;nothing outstanding&rdquo; is different from nobody having
            checked.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStarting(false)}>
              Cancel
            </Button>
            <Button onClick={start} loading={busy}>
              Start
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={clearing !== null}
        onClose={() => setClearing(null)}
        title={clearing ? `${humanize(clearing.area)} sign-off` : ""}
      >
        <div className="space-y-4">
          <Textarea
            label="Note"
            rows={3}
            placeholder="Nothing outstanding"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => clearItem(false)} loading={busy}>
              Mark as waiting
            </Button>
            <Button onClick={() => clearItem(true)} loading={busy}>
              Signed off
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
