"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DoorOpen, Printer, ShieldCheck, Ticket, Timer } from "lucide-react";

import { useBranding } from "@/components/BrandingProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  Textarea,
  humanize,
  td,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  StatStrip,
} from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { dateTime, readableDate } from "@/lib/dates";

/** A control sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type GatePass = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  leave_on: string;
  leave_time: string | null;
  reason: string;
  pickup_name: string;
  pickup_relation: string | null;
  pickup_phone: string | null;
  code: string | null;
  status: "requested" | "approved" | "rejected" | "departed" | "cancelled";
  requested_by_name: string | null;
  requested_by_parent: boolean;
  pickup_listed: boolean | null;
  decision_note: string | null;
  departed_at: string | null;
  created_at: string;
};

const TONE: Record<GatePass["status"], "emerald" | "amber" | "rose" | "neutral" | "brand"> = {
  requested: "amber",
  approved: "brand",
  rejected: "rose",
  departed: "emerald",
  cancelled: "neutral",
};

export default function GatePassesPage() {
  const branding = useBranding();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [on, setOn] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [deciding, setDeciding] = useState<GatePass | null>(null);
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const [printing, setPrinting] = useState<GatePass | null>(null);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<GatePass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<GatePass[]>("/api/v1/school/front-desk/gate-passes", {
        params: { on: on || undefined, pending_only: pendingOnly },
      })
      .then((r) => setPasses(r.data))
      .catch((e) => setError(apiError(e)));
  }, [on, pendingOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/front-desk/gate-passes/${deciding.id}/decide`, {
        approve,
        note: note.trim() || undefined,
      });
      setDeciding(null);
      setNote("");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const release = async (p: GatePass) => {
    if (!window.confirm(`Record ${p.student_name} as having left with ${p.pickup_name}?`))
      return;
    setError(null);
    try {
      await api.post(`/api/v1/school/front-desk/gate-passes/${p.id}/release`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFound(null);
    try {
      const r = await api.post<GatePass>(
        "/api/v1/school/front-desk/gate-passes/verify",
        { code }
      );
      setFound(r.data);
    } catch (err) {
      setError(apiError(err));
    }
  };

  const waiting = passes.filter((p) => p.status === "requested").length;
  const approved = passes.filter((p) => p.status === "approved").length;
  const gone = passes.filter((p) => p.status === "departed").length;

  return (
    <div className="space-y-6">
      {/* Only the pass itself goes on paper; everything else is screen
          furniture. A plain style element rather than styled-jsx, which needs
          its own typings to satisfy the compiler. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            body * { visibility: hidden; }
            #printable-pass, #printable-pass * { visibility: visible; }
            #printable-pass {
              position: fixed; inset: 0; margin: 0; padding: 24px;
              background: #fff; color: #000; border: 0;
            }
          }`,
        }}
      />

      <PageHeader
        title="Gate passes"
        subtitle="Who may collect a child today, and the slip the gate keeps."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Counted from the passes already on screen — no second request. */}
      <StatStrip
        stats={[
          {
            label: "Passes",
            value: passes.length,
            note: on ? readableDate(on) : "Today",
            icon: Ticket,
          },
          {
            label: "Waiting",
            value: waiting,
            note: waiting ? "Somebody has to decide" : "Nothing to decide",
            icon: Timer,
          },
          {
            label: "Approved, not gone",
            value: approved,
            note: "Still on the premises",
            icon: ShieldCheck,
          },
          { label: "Left", value: gone, note: "Recorded at the gate", icon: DoorOpen },
        ]}
      />

      <FilterBar>
        <input
          type="date"
          aria-label="Passes on this date"
          value={on}
          onChange={(e) => setOn(e.target.value)}
          className={filterSelect}
        />
        <label className="flex h-[41px] items-center gap-2 rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink-muted">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Waiting only
        </label>
      </FilterBar>

      <Card>
        <CardHeader>
          <CardTitle>Check a code at the gate</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={verify}>
            <Input
              label="Six-digit code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="submit" variant="secondary" disabled={code.length !== 6}>
              Look up
            </Button>
          </form>
          {found && (
            <NoticeBox>
              {found.student_name}
              {found.section_label ? ` (${found.section_label})` : ""} — to be collected by{" "}
              {found.pickup_name}
              {found.pickup_relation ? `, ${found.pickup_relation}` : ""}. Pass is{" "}
              {humanize(found.status)}.
            </NoticeBox>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today&rsquo;s passes</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {on ? readableDate(on) : "Today"} ·{" "}
              {pendingOnly ? "Waiting on a decision only" : "Every state"}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Student", "Collected by", "When", "Asked by", "State", ""]}
            empty={passes.length === 0 && "No gate passes have been raised."}
          >
            {passes.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <PersonCell name={p.student_name} sub={p.section_label} />
                </td>
                <td className={td}>
                  {p.pickup_name}
                  <span className="block text-[11px] text-ink-subtle">
                    {p.pickup_relation ?? "Relation not given"}
                    {p.pickup_listed === false && " · not a listed guardian"}
                  </span>
                </td>
                <td className={td}>
                  {readableDate(p.leave_on)}
                  {p.leave_time && (
                    <span className="block text-[11px] text-ink-subtle">{p.leave_time}</span>
                  )}
                </td>
                <td className={td}>
                  {p.requested_by_name ?? "—"}
                  {p.requested_by_parent && (
                    <span className="block text-[11px] text-ink-subtle">a parent</span>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={TONE[p.status]}>{humanize(p.status)}</Badge>
                  {p.departed_at && (
                    <span className="block text-[11px] text-ink-subtle">
                      {dateTime(p.departed_at)}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    {p.status === "requested" && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeciding(p);
                          setApprove(true);
                          setNote("");
                        }}
                      >
                        Decide
                      </Button>
                    )}
                    {p.status === "approved" && (
                      <Button variant="secondary" onClick={() => release(p)}>
                        Record leaving
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => setPrinting(p)}>
                      <Printer className="mr-1.5 h-4 w-4" />
                      Pass
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${passes.length} pass(es) on this day`}
          right={
            waiting
              ? `${waiting} waiting on a decision`
              : "Nothing waiting on a decision"
          }
        />
      </Card>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding ? `Gate pass for ${deciding.student_name}` : ""}
      >
        {deciding && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              {deciding.pickup_name}
              {deciding.pickup_relation ? `, ${deciding.pickup_relation}` : ""} wants to
              collect on {readableDate(deciding.leave_on)}. Reason: {deciding.reason}
            </p>
            {deciding.pickup_listed === false && (
              <NoticeBox>
                The named collector is not one of this child&rsquo;s listed guardians.
                Worth a phone call before approving.
              </NoticeBox>
            )}
            <div className="flex gap-2">
              <Button
                variant={approve ? "primary" : "secondary"}
                onClick={() => setApprove(true)}
              >
                Approve
              </Button>
              <Button
                variant={!approve ? "primary" : "secondary"}
                onClick={() => setApprove(false)}
              >
                Refuse
              </Button>
            </div>
            <Textarea
              label={approve ? "Note (optional)" : "Why it was refused"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeciding(null)}>
                Cancel
              </Button>
              <Button
                onClick={decide}
                loading={busy}
                disabled={!approve && !note.trim()}
              >
                {approve ? "Approve" : "Refuse"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={printing !== null}
        onClose={() => setPrinting(null)}
        title="Gate pass"
      >
        {printing && (
          <div className="space-y-4">
            <div
              id="printable-pass"
              className="rounded-[10px] border border-surface-border p-5"
            >
              <div className="border-b border-surface-border pb-3">
                <p className="text-[17px] font-extrabold text-ink">
                  {branding?.name ?? "School"}
                </p>
                <p className="text-[12px] text-ink-muted">Gate pass</p>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-y-2 text-[13px]">
                <dt className="font-bold text-ink-muted">Pass no</dt>
                <dd className="col-span-2 font-mono text-ink">
                  {printing.code ?? `GP-${printing.id}`}
                </dd>
                <dt className="font-bold text-ink-muted">Student</dt>
                <dd className="col-span-2 text-ink">
                  {printing.student_name}
                  {printing.section_label ? ` · ${printing.section_label}` : ""}
                </dd>
                <dt className="font-bold text-ink-muted">Collected by</dt>
                <dd className="col-span-2 text-ink">
                  {printing.pickup_name}
                  {printing.pickup_relation ? `, ${printing.pickup_relation}` : ""}
                  {printing.pickup_phone ? ` · ${printing.pickup_phone}` : ""}
                </dd>
                <dt className="font-bold text-ink-muted">Reason</dt>
                <dd className="col-span-2 text-ink">{printing.reason}</dd>
                <dt className="font-bold text-ink-muted">When</dt>
                <dd className="col-span-2 text-ink">
                  {readableDate(printing.leave_on)}
                  {printing.leave_time ? ` at ${printing.leave_time}` : ""}
                </dd>
                <dt className="font-bold text-ink-muted">Approved by</dt>
                <dd className="col-span-2 text-ink">
                  {printing.status === "requested"
                    ? "Not yet approved"
                    : printing.requested_by_name ?? "The school office"}
                </dd>
              </dl>
              <p className="mt-4 border-t border-surface-border pt-3 text-[11px] text-ink-muted">
                Hand this to the gate. The person collecting should be able to show
                identification matching the name above.
              </p>
              <p className="mt-6 text-[12px] text-ink-muted">
                _______________________
                <br />
                Gate signature
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPrinting(null)}>
                Close
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
