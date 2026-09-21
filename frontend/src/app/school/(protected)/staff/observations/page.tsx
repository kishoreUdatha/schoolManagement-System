"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Eye, EyeOff, Plus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Textarea,
  WarnBox,
  humanize,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate, toIso } from "@/lib/dates";

/** A select sized for the filter bar: one row of controls, no stacked label. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Observation = {
  id: number;
  staff_id: number;
  staff_name: string | null;
  observed_on: string;
  observer_name: string | null;
  subject_name: string | null;
  section_label: string | null;
  focus: string | null;
  strengths: string | null;
  next_steps: string | null;
  follow_up_on: string | null;
  shared_with_staff: boolean;
};
type Page = {
  observations: Observation[];
  count: number;
  unshared: number;
  follow_ups_due: number;
};
type StaffRow = { id: number; full_name: string; role: string };

const BLANK = {
  staff_id: "",
  observed_on: toIso(),
  focus: "",
  strengths: "",
  next_steps: "",
  follow_up_on: "",
  shared_with_staff: false,
};

/** Notes from sitting in on a lesson.
 *
 *  There is no score anywhere on this screen, and that is the point. A single
 *  figure out of five gets quoted in conversations the observer was not in,
 *  by people who were not in the room either. What a teacher can actually act
 *  on is a sentence about what went well and a sentence about what to try —
 *  so those are the only two things recorded.
 */
export default function ObservationsPage() {
  const [page, setPage] = useState<Page | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [form, setForm] = useState({ ...BLANK });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<Page>("/api/v1/school/staff-ops/observations", {
        params: { staff_id: filter || undefined },
      })
      .then((r) => setPage(r.data))
      .catch((e) => setError(apiError(e)));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get<StaffRow[]>("/api/v1/school/staff", { params: { role: "teacher" } })
      .then((r) => setStaff(r.data))
      .catch(() => setStaff([]));
  }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post("/api/v1/school/staff-ops/observations", {
        staff_id: Number(form.staff_id),
        observed_on: form.observed_on || null,
        focus: form.focus.trim() || null,
        strengths: form.strengths.trim() || null,
        next_steps: form.next_steps.trim() || null,
        follow_up_on: form.follow_up_on || null,
        shared_with_staff: form.shared_with_staff,
      });
      setForm({ ...BLANK });
      setAdding(false);
      setSaved("Recorded.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async (o: Observation, shared: boolean) => {
    setError(null);
    try {
      await api.post(`/api/v1/school/staff-ops/observations/${o.id}/share`, { shared });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const rows = page?.observations ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lesson observations"
        subtitle="What was seen, what went well, and what to try next."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Record one
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {/* The figures the endpoint already returns for this filter. */}
      <StatStrip
        stats={[
          {
            label: "Observations",
            value: page?.count ?? "—",
            note: filter ? "This teacher" : "Everybody",
            icon: Eye,
          },
          {
            label: "Not shared yet",
            value: page?.unshared ?? 0,
            note: "A note is a draft until the conversation has happened",
            icon: EyeOff,
          },
          {
            label: "Follow-ups due",
            value: page?.follow_ups_due ?? 0,
            note: "Dates already set on a note",
            icon: CalendarCheck,
          },
        ]}
      />

      <FilterBar>
        <select
          aria-label="Teacher"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={filterSelect}
        >
          <option value="">Everybody</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </FilterBar>

      <NoticeBox>
        Nothing here is scored. A mark out of five travels further than the
        conversation it came from and says less, so an observation records what
        was strong and what to try next instead.
      </NoticeBox>

      {rows.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-subtle">
              Nobody has sat in on a lesson yet.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="space-y-4">
        {rows.map((o) => (
          <Card key={o.id}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>
                  <Link href={`/school/staff/${o.staff_id}`} className="hover:underline">
                    {o.staff_name ?? "Staff member"}
                  </Link>
                </CardTitle>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {readableDate(o.observed_on)}
                  {o.subject_name ? ` · ${o.subject_name}` : ""}
                  {o.section_label ? ` · ${o.section_label}` : ""}
                  {o.observer_name ? ` · seen by ${o.observer_name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={o.shared_with_staff ? "emerald" : "neutral"}>
                  {o.shared_with_staff ? "Shared" : "Not shared"}
                </Badge>
                <Button variant="secondary" onClick={() => share(o, !o.shared_with_staff)}>
                  {o.shared_with_staff ? "Unshare" : "Share"}
                </Button>
              </div>
            </CardHeader>
            <CardBody className="space-y-2 text-[13px]">
              {o.focus && (
                <p className="text-ink-muted">
                  <span className="font-bold text-ink">Looking at: </span>
                  {o.focus}
                </p>
              )}
              {o.strengths && (
                <p className="text-ink-muted">
                  <span className="font-bold text-ink">What went well: </span>
                  {o.strengths}
                </p>
              )}
              {o.next_steps && (
                <p className="text-ink-muted">
                  <span className="font-bold text-ink">To try next: </span>
                  {o.next_steps}
                </p>
              )}
              {o.follow_up_on && (
                <p className="text-ink-subtle">
                  Follow up on {readableDate(o.follow_up_on)}
                </p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Record an observation">
        <div className="space-y-4">
          <Select
            label="Teacher"
            value={form.staff_id}
            onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
          >
            <option value="">Choose somebody</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
          <Input
            label="Date"
            type="date"
            value={form.observed_on}
            onChange={(e) => setForm({ ...form, observed_on: e.target.value })}
          />
          <Input
            label="What you were looking at"
            placeholder="Questioning, pace, behaviour"
            value={form.focus}
            onChange={(e) => setForm({ ...form, focus: e.target.value })}
          />
          <Textarea
            label="What went well"
            rows={3}
            value={form.strengths}
            onChange={(e) => setForm({ ...form, strengths: e.target.value })}
          />
          <Textarea
            label="What to try next"
            rows={3}
            value={form.next_steps}
            onChange={(e) => setForm({ ...form, next_steps: e.target.value })}
          />
          <Input
            label="Follow up on"
            type="date"
            value={form.follow_up_on}
            onChange={(e) => setForm({ ...form, follow_up_on: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={form.shared_with_staff}
              onChange={(e) =>
                setForm({ ...form, shared_with_staff: e.target.checked })
              }
            />
            Share it with them now
          </label>
          <WarnBox>
            An observation needs either a strength or a next step. One with
            neither says nothing to the person it is about.
          </WarnBox>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={add}
              loading={busy}
              disabled={
                !form.staff_id || (!form.strengths.trim() && !form.next_steps.trim())
              }
            >
              Record
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
