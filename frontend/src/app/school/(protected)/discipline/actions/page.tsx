"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate, toIso } from "@/lib/dates";

type Action = {
  id: number;
  incident_id: number;
  reference_no: string | null;
  student_id?: number;
  student_name?: string | null;
  admission_no?: string | null;
  section_label?: string | null;
  kind: string;
  details: string | null;
  start_date: string | null;
  end_date: string | null;
  assigned_by: string | null;
  completed_on: string | null;
  completed_by: string | null;
  is_served: boolean;
  overdue: boolean;
};

type Result = { actions: Action[]; outstanding: number; overdue: number };

/** Sanctions, and which of them anybody has actually seen through.
 *
 *  A detention that was set and never served looked identical to one that was
 *  — the column existed but nothing ever wrote to it. Signing one off names
 *  who did, which is what makes "served" a fact rather than an assumption.
 */
export default function DisciplineActionsPage() {
  const [data, setData] = useState<Result | null>(null);
  const [outstandingOnly, setOutstandingOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serving, setServing] = useState<Action | null>(null);
  const [servedOn, setServedOn] = useState(toIso());

  const load = useCallback(() => {
    api
      .get<Result>("/api/v1/school/wellbeing/discipline/actions", {
        params: { outstanding_only: outstandingOnly },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [outstandingOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const serve = async () => {
    if (!serving) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post(
        `/api/v1/school/wellbeing/discipline/actions/${serving.id}/serve`,
        { served_on: servedOn }
      );
      setSaved(`${humanize(serving.kind)} marked served.`);
      setServing(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (a: Action) => {
    if (!window.confirm(`Undo the sign-off on ${humanize(a.kind)}?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/wellbeing/discipline/actions/${a.id}/serve`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const rows = data?.actions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sanctions and follow-up"
        subtitle="Detentions, suspensions and meetings — set, and either served or still outstanding."
        actions={
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={outstandingOnly}
              onChange={(e) => setOutstandingOnly(e.target.checked)}
            />
            Only what is outstanding
          </label>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {/* The three counts the endpoint already returned, as one summary of
          the screen rather than three separate cards. */}
      <StatStrip
        stats={[
          {
            label: "Showing",
            value: rows.length,
            note: outstandingOnly ? "Outstanding only" : "Every sanction recorded",
          },
          {
            label: "Outstanding",
            value: data?.outstanding ?? 0,
            note: "Set but not signed off",
          },
          {
            label: "Overdue",
            value: data?.overdue ?? 0,
            note: "Past their end date",
          },
        ]}
      />

      {(data?.overdue ?? 0) > 0 && (
        <WarnBox>
          {data?.overdue} sanction{data?.overdue === 1 ? "" : "s"} passed their end date
          without being signed off. Either they were served and nobody said so, or they
          were never served at all — and the record cannot tell the difference.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sanctions</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {outstandingOnly
                ? "Only what is still outstanding · newest incidents first"
                : "Everything set, served or not · newest incidents first"}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Sanction", "When", "Set by", "Served", ""]}
            empty={
              rows.length === 0 &&
              (outstandingOnly
                ? "Nothing outstanding — everything set has been signed off."
                : "No sanctions recorded yet.")
            }
          >
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={tdStrong}>
                  {a.student_name ?? "—"}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {a.reference_no}
                    {a.section_label ? ` · ${a.section_label}` : ""}
                  </span>
                </td>
                <td className={td}>
                  {humanize(a.kind)}
                  {a.details && (
                    <span className="block text-[11px] text-ink-subtle">{a.details}</span>
                  )}
                </td>
                <td className={td}>
                  {a.start_date ? readableDate(a.start_date) : "—"}
                  {a.end_date && a.end_date !== a.start_date && (
                    <span className="block text-[11px] text-ink-subtle">
                      to {readableDate(a.end_date)}
                    </span>
                  )}
                </td>
                <td className={td}>{a.assigned_by ?? "—"}</td>
                <td className={td}>
                  {a.is_served ? (
                    <>
                      <Badge tone="emerald">
                        {a.completed_on ? readableDate(a.completed_on) : "Served"}
                      </Badge>
                      {a.completed_by && (
                        <span className="block text-[11px] text-ink-subtle">
                          by {a.completed_by}
                        </span>
                      )}
                    </>
                  ) : a.overdue ? (
                    <Badge tone="rose">Overdue</Badge>
                  ) : (
                    <Badge tone="amber">Outstanding</Badge>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Link
                      href={`/school/discipline?incident=${a.incident_id}`}
                      className="text-[13px] font-bold text-brand-600 hover:underline"
                    >
                      Incident
                    </Link>
                    {a.is_served ? (
                      <Button variant="secondary" onClick={() => undo(a)}>
                        Undo
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setServing(a);
                          setServedOn(a.end_date ?? toIso());
                        }}
                      >
                        Mark served
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${rows.length} sanction${rows.length === 1 ? "" : "s"}`}
          right={`${data?.outstanding ?? 0} outstanding · ${data?.overdue ?? 0} overdue`}
        />
      </Card>

      <Modal
        open={serving !== null}
        onClose={() => setServing(null)}
        title={serving ? `Mark ${humanize(serving.kind)} served` : ""}
      >
        {serving && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              This records that {serving.student_name} completed it, and that you are the
              one saying so.
            </p>
            <Input
              label="Served on"
              type="date"
              value={servedOn}
              max={toIso()}
              onChange={(e) => setServedOn(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setServing(null)}>
                Cancel
              </Button>
              <Button onClick={serve} loading={busy}>
                Mark served
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
