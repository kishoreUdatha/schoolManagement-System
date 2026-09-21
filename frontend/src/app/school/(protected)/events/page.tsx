"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { EventForm, type SchoolEvent } from "@/components/events/EventForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type ConsentReport = {
  eligible: number;
  yes: number;
  no: number;
  pending: number;
  rows: {
    student_id: number;
    student_name: string;
    admission_no: string | null;
    class_label: string | null;
    response: "yes" | "no" | null;
    note: string | null;
    responded_at: string | null;
    parent_name: string | null;
  }[];
};

const today = () => new Date().toISOString().slice(0, 10);

export default function EventsPage() {
  const [items, setItems] = useState<SchoolEvent[]>([]);
  const [when, setWhen] = useState<"upcoming" | "past" | "all">("upcoming");
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [report, setReport] = useState<{ ev: SchoolEvent; data: ConsentReport } | null>(null);
  const [filter, setFilter] = useState<"all" | "yes" | "no" | "pending">("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    const params = when === "upcoming" ? { start: today() } : when === "past" ? { end: today() } : {};
    api
      .get<SchoolEvent[]>("/api/v1/school/events", { params })
      .then((r) => setItems(when === "past" ? [...r.data].reverse() : r.data))
      .catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when]);

  async function act(ev: SchoolEvent, action: "publish" | "cancel" | "delete") {
    const ask = {
      publish: `Publish "${ev.title}"? ${ev.audience_label} will be notified.`,
      cancel: `Cancel "${ev.title}"?${ev.is_published ? " Everyone who was told about it will be notified." : ""}`,
      delete: `Delete the draft "${ev.title}"?`,
    }[action];
    if (!window.confirm(ask)) return;
    try {
      if (action === "delete") await api.delete(`/api/v1/school/events/${ev.id}`);
      else await api.post(`/api/v1/school/events/${ev.id}/${action}`);
      setNotice(action === "publish" ? "Published and notified." : action === "cancel" ? "Event cancelled." : "Draft deleted.");
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function openReport(ev: SchoolEvent) {
    try {
      const r = await api.get<ConsentReport>(`/api/v1/school/events/${ev.id}/consents`);
      setFilter("all");
      setReport({ ev, data: r.data });
    } catch (e) {
      setError(apiError(e));
    }
  }

  const rows = report?.data.rows.filter((r) => filter === "all" || (filter === "pending" ? !r.response : r.response === filter)) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        subtitle="Plan school events, notify the right parents and collect consent for trips."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New event
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {/* The one control this page has, in the bar the rest of the ERP puts
          its filters in. There is no search state here to put first. */}
      <FilterBar>
        <select
          aria-label="Show"
          value={when}
          onChange={(e) => setWhen(e.target.value as typeof when)}
          className={filterSelect}
        >
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="all">All</option>
        </select>
      </FilterBar>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {when === "upcoming" ? "Upcoming events" : when === "past" ? "Past events" : "All events"}
            </CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Drafts are visible only here; publishing is what tells the audience.
            </p>
          </div>
        </CardHeader>
        <Table head={["When", "Event", "Audience", "Consent", "Status", ""]} empty={items.length === 0 && "No events."}>
          {items.map((ev) => (
            <tr key={ev.id}>
              <td className={td}>
                {ev.start_date}
                {ev.end_date !== ev.start_date && ` → ${ev.end_date}`}
                <div className="text-xs text-ink-subtle">
                  {ev.start_time ? `${hhmm(ev.start_time)}${ev.end_time ? `–${hhmm(ev.end_time)}` : ""}` : "All day"}
                </div>
              </td>
              <td className={tdStrong}>
                {/* The title is the way into the register; without a link the
                    coach-door list exists but nobody finds it. */}
                <Link
                  href={`/school/events/${ev.id}`}
                  className={`hover:text-brand-600 hover:underline ${ev.is_cancelled ? "line-through" : ""}`}
                >
                  {ev.title}
                </Link>
                <div className="text-xs font-normal text-ink-subtle">
                  {humanize(ev.kind)}
                  {ev.venue && ` · ${ev.venue}`}
                  {ev.fee_amount && ` · ${inr(ev.fee_amount)}`}
                </div>
              </td>
              <td className={td}>{ev.audience_label}</td>
              <td className={td}>
                {ev.requires_consent ? (
                  <button type="button" className="text-left text-brand-500 hover:underline" onClick={() => openReport(ev)}>
                    {ev.consent_yes} yes · {ev.consent_no} no
                    {ev.consent_deadline && <div className="text-xs text-ink-subtle">by {ev.consent_deadline}</div>}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td className={td}>
                {ev.is_cancelled ? (
                  <Badge tone="rose">cancelled</Badge>
                ) : ev.is_published ? (
                  <Badge tone="emerald">published</Badge>
                ) : (
                  <Badge>draft</Badge>
                )}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {!ev.is_cancelled && (
                  <>
                    {!ev.is_published && (
                      <Button size="sm" onClick={() => act(ev, "publish")}>
                        Publish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(ev);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    {ev.is_published ? (
                      <Button size="sm" variant="ghost" onClick={() => act(ev, "cancel")}>
                        Cancel
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => act(ev, "delete")}>
                        Delete
                      </Button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${items.length} event(s) shown`}
          right={`${items.filter((ev) => ev.is_published && !ev.is_cancelled).length} published · ${items.filter((ev) => !ev.is_published && !ev.is_cancelled).length} draft`}
        />
      </Card>

      <EventForm
        open={formOpen}
        event={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          setNotice(editing ? "Event updated." : "Draft saved. Publish it to notify the audience.");
          load();
        }}
      />

      <Modal open={!!report} onClose={() => setReport(null)} title={`Consent: ${report?.ev.title ?? ""}`} size="lg">
        {report && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              {(["all", "yes", "no", "pending"] as const).map((k) => (
                <Button key={k} size="sm" variant={filter === k ? "primary" : "secondary"} onClick={() => setFilter(k)}>
                  {k === "all" ? `All ${report.data.eligible}` : `${humanize(k)} ${report.data[k]}`}
                </Button>
              ))}
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <Table head={["Student", "Class", "Answer", "By", "Note"]} empty={rows.length === 0 && "Nobody here."}>
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className={tdStrong}>
                      {r.student_name}
                      {r.admission_no && <div className="text-xs font-normal text-ink-subtle">{r.admission_no}</div>}
                    </td>
                    <td className={td}>{r.class_label}</td>
                    <td className={td}>
                      {r.response ? <Badge tone={r.response === "yes" ? "emerald" : "rose"}>{r.response}</Badge> : <Badge tone="amber">pending</Badge>}
                    </td>
                    <td className={td}>{r.parent_name ?? "—"}</td>
                    <td className={td}>{r.note ?? ""}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
