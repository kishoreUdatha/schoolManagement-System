"use client";

import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

import { TimetableFrame, type SideTab } from "./TimetableFrame";
import { shortTime } from "./TimetableGrid";
import type { GridCell, TeacherWeek } from "./types";

type NextClass = {
  section_label: string;
  subject_name: string;
  period_number: number;
  start_time: string;
  end_time: string;
  day_label: string;
  day_of_week: number;
};

/** A teacher's own weekly timetable (published sections only). */
export function MyTimetable() {
  const [week, setWeek] = useState<TeacherWeek | null>(null);
  const [next, setNext] = useState<{ next: NextClass | null; today: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const me = auth.getUser();
    if (!me) return;
    Promise.all([
      api.get<TeacherWeek>(`/api/v1/timetable/teachers/${me.id}`),
      api.get<{ next_class: NextClass | null; today_day_of_week: number }>(
        "/api/v1/teacher/timetable"
      ),
    ])
      .then(([w, t]) => {
        setWeek(w.data);
        setNext({ next: t.data.next_class, today: t.data.today_day_of_week });
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  const cells = useMemo(() => {
    const m = new Map<number, GridCell>();
    week?.entries.forEach((e) =>
      m.set(e.period_id, {
        key: e.id,
        subject_name: e.subject_name,
        subject_code: e.subject_code,
        subtitle: e.section_label,
        notes: e.notes,
      })
    );
    return m;
  }, [week]);

  const sideTabs = useMemo<SideTab[]>(() => {
    const subj = new Map<string, { name: string; code: string; count: number }>();
    const secs = new Map<number, { label: string; count: number }>();
    week?.entries.forEach((e) => {
      const s = subj.get(e.subject_code) ?? { name: e.subject_name, code: e.subject_code, count: 0 };
      s.count += 1;
      subj.set(e.subject_code, s);
      const c = secs.get(e.section_id) ?? { label: e.section_label, count: 0 };
      c.count += 1;
      secs.set(e.section_id, c);
    });
    return [
      {
        key: "subjects",
        label: "Subjects",
        items: Array.from(subj.values()).map((s) => ({
          key: s.code,
          title: s.name,
          count: s.count,
          subject: { name: s.name, code: s.code },
        })),
      },
      {
        key: "sections",
        label: "Sections",
        items: Array.from(secs.entries()).map(([id, s]) => ({
          key: id,
          title: s.label,
          count: s.count,
        })),
      },
    ];
  }, [week]);

  if (error) {
    return <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>;
  }
  if (!week) return <div className="text-sm text-ink-muted">Loading…</div>;

  const n = next?.next;
  return (
    <div className="space-y-4">
      {n && (
        <Card className="print:hidden">
          <CardBody className="flex items-start gap-3 py-3">
            <span className="rounded-full bg-brand-500/15 p-2 text-brand-600">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-subtle">
                Next class{n.day_of_week !== next?.today ? ` · ${n.day_label}` : " · today"}
              </div>
              <div className="text-sm font-medium text-ink">
                {n.subject_name} · {n.section_label}
              </div>
              <div className="text-xs text-ink-muted">
                P{n.period_number} · {shortTime(n.start_time)} – {shortTime(n.end_time)}
              </div>
            </div>
          </CardBody>
        </Card>
      )}
      <TimetableFrame
        title={week.teacher_name}
        subtitle={
          week.entries.length === 0
            ? "Your classes aren't on a published timetable yet."
            : `Weekly timetable · ${week.entries.length} class${week.entries.length === 1 ? "" : "es"}`
        }
        periods={week.periods}
        cells={cells}
        sideTabs={sideTabs}
      />
    </div>
  );
}
