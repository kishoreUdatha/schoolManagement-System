"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, WarnBox, humanize } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { longDate, toIso } from "@/lib/dates";

type Interview = {
  id: number;
  round_no: number;
  scheduled_at: string;
  minutes: number;
  mode: string;
  place_or_link: string | null;
  panel_user_ids: number[];
  panel_names: string[];
  status: string;
  feedback: string | null;
  rating: number | null;
  recommended: boolean | null;
};
type Application = {
  id: number;
  opening_id: number;
  opening_title: string;
  candidate_id: number;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  stage: string;
  interviews: Interview[];
};

/** One interview with the candidate attached, which the API never returns
 *  together — interviews only come back inside an application. */
type Slot = Interview & {
  application_id: number;
  candidate_name: string;
  opening_title: string;
  start: Date;
  end: Date;
};

const STATUS_TONE: Record<string, "neutral" | "emerald" | "amber" | "rose" | "brand"> = {
  scheduled: "brand",
  done: "emerald",
  cancelled: "neutral",
  no_show: "rose",
};

/** How many applications to open when building the week.
 *
 *  There is no endpoint that lists interviews across applications — they are
 *  only returned inside a single application's detail — so a calendar costs
 *  one request per application. Bounded rather than unbounded, and the page
 *  says when it stopped looking.
 */
const MAX_LOOKUPS = 80;

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Monday, because a school week does.
  const shift = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - shift);
  return copy;
}

export default function InterviewCalendarPage() {
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.get<Application[]>("/api/v1/school/hr/applications");
      const apps = list.data;
      setTruncated(apps.length > MAX_LOOKUPS);

      const details = await Promise.all(
        apps.slice(0, MAX_LOOKUPS).map((a) =>
          api
            .get<Application>(`/api/v1/school/hr/applications/${a.id}`)
            .then((r) => r.data)
            .catch(() => null)
        )
      );

      const out: Slot[] = [];
      details.forEach((a) => {
        if (!a) return;
        (a.interviews ?? []).forEach((iv) => {
          // scheduled_at is a full timestamp with an offset, so Date parses it
          // correctly — the UTC-midnight trap only bites date-only strings.
          const start = new Date(iv.scheduled_at);
          out.push({
            ...iv,
            application_id: a.id,
            candidate_name: a.candidate_name,
            opening_title: a.opening_title,
            start,
            end: new Date(start.getTime() + iv.minutes * 60_000),
          });
        });
      });
      setSlots(out);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      return d;
    });
  }, [anchor]);

  const weekSlots = useMemo(() => {
    const first = days[0];
    const last = new Date(days[6]);
    last.setHours(23, 59, 59, 999);
    return slots
      .filter((s) => s.start >= first && s.start <= last)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [slots, days]);

  /** The same interviewer in two places at once. A calendar that cannot say
   *  this is just a list with dates on it. */
  const clashing = useMemo(() => {
    const bad = new Set<number>();
    const live = weekSlots.filter((s) => s.status === "scheduled");
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i];
        const b = live[j];
        if (a.start >= b.end || b.start >= a.end) continue;
        const shared = a.panel_user_ids.filter((u) => b.panel_user_ids.includes(u));
        if (shared.length) {
          bad.add(a.id);
          bad.add(b.id);
        }
      }
    }
    return bad;
  }, [weekSlots]);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    weekSlots.forEach((s) => {
      const key = toIso(s.start);
      map.set(key, [...(map.get(key) ?? []), s]);
    });
    return map;
  }, [weekSlots]);

  const shift = (weeks: number) => {
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + weeks * 7);
    setAnchor(startOfWeek(next));
  };

  const time = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <Link
        href="/school/recruitment"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Recruitment
      </Link>

      <PageHeader
        title="Interview calendar"
        subtitle="Every interview across all applications, a week at a time."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => setAnchor(startOfWeek(new Date()))}>
              This week
            </Button>
            <Button variant="secondary" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This week" value={weekSlots.length} />
        <StatCard
          label="Still to happen"
          value={weekSlots.filter((s) => s.status === "scheduled").length}
        />
        <StatCard
          label="Clashes"
          value={clashing.size}
          accent={clashing.size ? "rose" : "emerald"}
        />
        <StatCard label="Interviews on file" value={slots.length} />
      </div>

      {clashing.size > 0 && (
        <WarnBox>
          {clashing.size} interview(s) put the same person on two panels at the same
          hour. They are marked below — somebody has to move.
        </WarnBox>
      )}

      {truncated && (
        <NoticeBox>
          Only the first {MAX_LOOKUPS} applications were opened. There is no endpoint
          that lists interviews on their own, so the calendar is built one application
          at a time.
        </NoticeBox>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => {
          const key = toIso(d);
          const list = byDay.get(key) ?? [];
          const isToday = key === toIso(new Date());
          return (
            <Card key={key} className={isToday ? "border-brand-300" : undefined}>
              <CardHeader>
                <CardTitle className="text-[15px]">{longDate(key)}</CardTitle>
                {isToday && <Badge tone="brand">Today</Badge>}
              </CardHeader>
              <CardBody className="space-y-3">
                {list.length === 0 && (
                  <p className="text-[13px] text-ink-subtle">
                    {loading ? "Loading…" : "Nothing booked."}
                  </p>
                )}
                {list.map((s) => (
                  <div
                    key={s.id}
                    className={
                      clashing.has(s.id)
                        ? "rounded-[10px] border border-[#B82E45] bg-[#FFEBEE] p-3 dark:bg-rose-500/10"
                        : "rounded-[10px] border border-surface-border p-3"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-[13px] font-extrabold text-ink">
                        {time(s.start)} – {time(s.end)}
                      </span>
                      <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                        {humanize(s.status)}
                      </Badge>
                    </div>
                    <Link
                      href={`/school/recruitment?application=${s.application_id}`}
                      className="mt-1 block text-[13px] font-bold text-brand-600 hover:underline"
                    >
                      {s.candidate_name}
                    </Link>
                    <p className="text-[12px] text-ink-muted">
                      {s.opening_title} · round {s.round_no} · {humanize(s.mode)}
                    </p>
                    {s.place_or_link && (
                      <p className="text-[11px] text-ink-subtle">{s.place_or_link}</p>
                    )}
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      {s.panel_names.filter(Boolean).length
                        ? `Panel: ${s.panel_names.filter(Boolean).join(", ")}`
                        : "No panel recorded"}
                    </p>
                    {clashing.has(s.id) && (
                      <p className="mt-1 text-[11px] font-bold text-[#B82E45]">
                        A panel member is double-booked at this hour.
                      </p>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <p className="text-[12px] text-ink-subtle">
        Interviews are scheduled from an application. Open a candidate on{" "}
        <Link href="/school/recruitment" className="font-bold text-brand-600 hover:underline">
          recruitment
        </Link>{" "}
        to book, move or record feedback on one.
      </p>
    </div>
  );
}
