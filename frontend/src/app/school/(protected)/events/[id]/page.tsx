"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BusFront, ChevronLeft, CircleHelp, FileCheck2, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

type Row = {
  student_id: number;
  student_name: string;
  admission_no: string;
  class_label: string | null;
  consent: string | null;
  consented: boolean;
  attended: boolean | null;
  note: string | null;
  marked_by: string | null;
  marked_at: string | null;
  consented_absent: boolean;
  came_without_consent: boolean;
};
type Register = {
  event: { id: number; title: string; start_date: string; venue: string | null };
  requires_consent: boolean;
  eligible: number;
  consented: number;
  attended: number;
  unmarked: number;
  consented_absent: number;
  came_without_consent: number;
  rows: Row[];
};

/** The register at the coach door.
 *
 *  Consent and attendance are shown side by side and neither is inferred
 *  from the other. A parent saying yes a fortnight ago is a promise; who
 *  boarded is what happened, and the gap between them is the only reason to
 *  open this screen in a hurry.
 */
export default function EventRegisterPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Register | null>(null);
  const [edits, setEdits] = useState<Record<number, { attended: boolean; note: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Register>(`/api/v1/school/event-ops/events/${id}/register`)
      .then((r) => {
        setData(r.data);
        setEdits({});
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const rows = data?.rows ?? [];
  const stateOf = (r: Row) =>
    edits[r.student_id] ?? { attended: r.attended ?? false, note: r.note ?? "" };

  const dirty = useMemo(
    () =>
      rows.filter((r) => {
        const e = edits[r.student_id];
        if (!e) return false;
        return e.attended !== r.attended || (e.note || "") !== (r.note || "");
      }),
    [rows, edits]
  );

  const set = (r: Row, patch: Partial<{ attended: boolean; note: string }>) =>
    setEdits((prev) => ({
      ...prev,
      [r.student_id]: { ...stateOf(r), ...patch },
    }));

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await api.post<Register>(
        `/api/v1/school/event-ops/events/${id}/register`,
        {
          entries: dirty.map((r) => ({
            student_id: r.student_id,
            attended: stateOf(r).attended,
            note: stateOf(r).note || null,
          })),
        }
      );
      setData(res.data);
      setEdits({});
      setSaved(`${dirty.length} child(ren) counted.`);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/school/events"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All events
      </Link>

      <PageHeader
        title={data?.event.title ?? "Event"}
        subtitle={
          data
            ? `${readableDate(data.event.start_date)}${
                data.event.venue ? ` · ${data.event.venue}` : ""
              }`
            : "Who may go, who said yes, and who boarded."
        }
        actions={
          <Button onClick={save} loading={busy} disabled={dirty.length === 0}>
            Save {dirty.length || ""} change{dirty.length === 1 ? "" : "s"}
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {/* The register the API returned, counted four ways — nothing fetched
          a second time. */}
      <StatStrip
        stats={[
          {
            label: "Eligible",
            value: data?.eligible ?? "—",
            note: "Children who may go",
            icon: Users,
          },
          {
            label: "Consented",
            value: data ? data.consented : "—",
            note: data?.requires_consent
              ? "Parents who said yes"
              : "This event does not ask for consent",
            icon: FileCheck2,
          },
          {
            label: "Boarded",
            value: data?.attended ?? "—",
            note: "Counted at the coach door",
            icon: BusFront,
          },
          {
            label: "Not counted yet",
            value: data?.unmarked ?? "—",
            note: data && data.unmarked > 0 ? "Neither here nor absent" : "Everybody counted",
            icon: CircleHelp,
          },
        ]}
      />

      {data && data.consented_absent > 0 && (
        <WarnBox>
          {data.consented_absent} child(ren) whose parents said yes are not on the coach.
          They are marked below — check before you leave.
        </WarnBox>
      )}
      {data && data.came_without_consent > 0 && (
        <WarnBox>
          {data.came_without_consent} child(ren) are marked as boarded without a consent
          form. That needs sorting out today, not afterwards.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Register</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Ticking counts a child as boarded
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Class", "Consent", "Boarded", "Note", "Counted by"]}
            empty={rows.length === 0 && "Nobody is eligible for this event yet."}
          >
            {rows.map((r) => {
              const s = stateOf(r);
              return (
                <tr
                  key={r.student_id}
                  className={r.consented_absent ? "bg-danger-bg/40" : undefined}
                >
                  <td className={td}>{r.admission_no}</td>
                  <td className="px-4 py-3">
                    <PersonCell name={r.student_name} sub={r.admission_no} />
                  </td>
                  <td className={td}>{r.class_label ?? "—"}</td>
                  <td className={td}>
                    {r.consent === "yes" ? (
                      <Badge tone="emerald">Yes</Badge>
                    ) : r.consent === "no" ? (
                      <Badge tone="rose">No</Badge>
                    ) : (
                      <Badge tone="neutral">No answer</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                      <input
                        type="checkbox"
                        checked={s.attended}
                        onChange={(e) => set(r, { attended: e.target.checked })}
                        aria-label={`Boarded: ${r.student_name}`}
                      />
                      {r.attended === null ? (
                        <span className="text-ink-subtle">not counted</span>
                      ) : r.attended ? (
                        "here"
                      ) : (
                        <span className="font-bold text-danger">not here</span>
                      )}
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={s.note}
                      placeholder="—"
                      onChange={(e) => set(r, { note: e.target.value })}
                      aria-label={`Note for ${r.student_name}`}
                    />
                  </td>
                  <td className={td}>
                    {r.marked_by ? (
                      <>
                        {r.marked_by}
                        {r.marked_at && (
                          <span className="block text-[11px] text-ink-subtle">
                            {r.marked_at.slice(11, 16)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${rows.length} child(ren) on this register`}
          right={
            dirty.length
              ? `${dirty.length} change(s) not saved yet`
              : "Nothing waiting to be saved"
          }
        />
      </Card>

      <p className="text-[12px] text-ink-subtle">
        A child left unticked is not marked absent — they are simply uncounted. Save the
        register once you have been through everybody, so the two can be told apart.
      </p>
    </div>
  );
}
