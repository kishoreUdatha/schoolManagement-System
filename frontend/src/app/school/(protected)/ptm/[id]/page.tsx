"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { PtmForm, slotTone, type PtmDetail, type PtmSlot } from "@/components/events/Ptm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, humanize } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type StaffRow = { user_id: number; full_name: string; role: string };

export default function PtmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const base = `/api/v1/school/ptm/${id}`;
  const [s, setS] = useState<PtmDetail | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<PtmDetail>(base)
      .then((r) => setS(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<StaffRow[]>("/api/v1/school/directory/staff")
      .then((r) => setStaff(r.data.filter((x) => x.role === "teacher" || x.role === "principal")))
      .catch(() => setStaff([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn();
      setError(null);
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (!s) return <ErrorBox>{error}</ErrorBox>;

  const inSession = new Set(s.teachers.map((t) => t.teacher_user_id));
  const available = staff.filter((x) => !inSession.has(x.user_id));

  const cancelBooking = (slot: PtmSlot) => {
    if (!window.confirm(`Cancel ${slot.student_name}'s ${hhmm(slot.start_time)} booking? The parent will be told.`)) return;
    run(() => api.delete(`${base}/slots/${slot.id}/booking`), "Booking cancelled.");
  };

  return (
    <div className="space-y-6">
      <Link href="/school/ptm" className="text-sm text-brand-500 hover:underline">
        ← All meetings
      </Link>
      <PageHeader
        title={s.title}
        subtitle={`${s.meeting_date} · ${hhmm(s.start_time)}–${hhmm(s.end_time)} · ${s.slot_minutes} min slots · ${s.scope_label}${
          s.venue ? ` · ${s.venue}` : ""
        }`}
        actions={
          <>
            {!s.is_published && (
              <Button
                onClick={() =>
                  window.confirm("Publish and invite parents to book?") &&
                  run(() => api.post(`${base}/publish`), "Published. Parents and teachers were notified.")
                }
              >
                Publish
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {s.booked_count === 0 && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm("Delete this meeting?")) return;
                  try {
                    await api.delete(base);
                    router.push("/school/ptm");
                  } catch (e) {
                    setError(apiError(e));
                  }
                }}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap gap-2">
        <Badge tone={s.is_published ? "emerald" : "neutral"}>{s.is_published ? "open for booking" : "draft"}</Badge>
        <Badge>
          {s.booked_count} of {s.slot_count} slots booked
        </Badge>
        {s.booking_closes_at && <Badge tone="amber">bookings close {new Date(s.booking_closes_at).toLocaleString()}</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add teachers</CardTitle>
        </CardHeader>
        <CardBody>
          {available.length === 0 ? (
            <p className="text-sm text-ink-subtle">Every teacher is already in this meeting.</p>
          ) : (
            <>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                {available.map((t) => (
                  <label key={t.user_id} className="flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={pick.has(t.user_id)}
                      onChange={(e) => {
                        const n = new Set(pick);
                        if (e.target.checked) n.add(t.user_id);
                        else n.delete(t.user_id);
                        setPick(n);
                      }}
                    />
                    {t.full_name}
                    {t.role === "principal" && <span className="text-xs text-ink-subtle">(principal)</span>}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPick(new Set(available.map((t) => t.user_id)))}>
                  Select all
                </Button>
                <Button
                  size="sm"
                  disabled={pick.size === 0}
                  onClick={() =>
                    run(async () => {
                      await api.post(`${base}/teachers`, { user_ids: Array.from(pick) });
                      setPick(new Set());
                    }, "Teachers added and their slots created.")
                  }
                >
                  Add {pick.size || ""} teacher{pick.size === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {s.teachers.map((t) => {
        const booked = t.slots.filter((x) => x.student_id).length;
        return (
          <Card key={t.teacher_user_id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  {t.teacher_name}{" "}
                  <span className="text-sm font-normal text-ink-subtle">
                    {booked}/{t.slots.length} booked
                  </span>
                </CardTitle>
                {booked === 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => run(() => api.delete(`${base}/teachers/${t.teacher_user_id}`), `${t.teacher_name} removed.`)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {t.slots.map((x) => (
                  <div key={x.id} className="rounded-md border border-surface-border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">
                        {hhmm(x.start_time)}–{hhmm(x.end_time)}
                      </span>
                      <Badge tone={slotTone[x.status]}>{humanize(x.status)}</Badge>
                    </div>
                    {x.student_name && (
                      <div className="mt-1 text-ink-muted">
                        {x.student_name}
                        {x.class_label && ` · ${x.class_label}`}
                        {x.parent_name && <div className="text-xs text-ink-subtle">with {x.parent_name}</div>}
                        {x.parent_note && <div className="text-xs italic text-ink-subtle">“{x.parent_note}”</div>}
                        {x.teacher_notes && <div className="mt-1 text-xs text-ink">Notes: {x.teacher_notes}</div>}
                        {x.status === "booked" && (
                          <button type="button" className="mt-1 text-xs text-danger hover:underline" onClick={() => cancelBooking(x)}>
                            Cancel booking
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        );
      })}

      <PtmForm
        open={editing}
        session={s}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setNotice("Meeting updated.");
          load();
        }}
      />
    </div>
  );
}
