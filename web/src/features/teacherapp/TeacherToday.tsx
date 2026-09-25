"use client";

import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { dayLabel, greeting, hhmm, plural, PmEmpty, PmError, PmLoading, todayIso } from "./parts";
import { STUDENT_LEAVES, type StudentLeave } from "./TeacherLeave";

type TodayClass = {
  period_id: number;
  period_number: number;
  start_time: string;
  end_time: string;
  section_id: number;
  section_label: string;
  subject_name: string;
  subject_code: string;
  is_break: boolean;
};
type Dashboard = {
  today_iso_date: string;
  todays_classes: TodayClass[];
  class_teacher_of: { section_id: number; section_label: string; class_id: number; capacity: number }[];
  unread_notices: number;
};
type Timetable = {
  next_class: { section_label: string; subject_name: string; start_time: string; end_time: string; day_label: string; day_of_week: number } | null;
  today_day_of_week: number;
};
type AttendanceView = { summary: Record<string, number>; is_holiday: boolean; holiday_name: string | null };

/** TM-002. The teacher's day: next class, today's periods, attendance still to mark, quick actions. */
export function TeacherToday() {
  const { go } = useTeacherApp();
  const me = useSession()?.user;
  const dash = useApi<Dashboard>("/api/v1/teacher/dashboard");
  const tt = useApi<Timetable>("/api/v1/teacher/timetable");
  const convs = useApi<{ unread_for_viewer: number }[]>("/api/v1/teacher/conversations");
  const unread = (convs.data ?? []).reduce((n, c) => n + c.unread_for_viewer, 0);
  const leaves = useApi<StudentLeave[]>(STUDENT_LEAVES, { status: "pending" });
  const toDecide = (leaves.data ?? []).filter((l) => l.can_decide).length;

  const d = dash.data;
  const next = tt.data?.next_class;
  const classes = (d?.todays_classes ?? []).filter((c) => !c.is_break);

  return (
    <>
      <div className="v-greeting">
        <p>
          {`${greeting()}${me ? `, ${me.full_name.split(/\s+/)[0]}` : ""} `}
          <span>{dayLabel(todayIso()).toUpperCase()}</span>
        </p>
        <h1>Your school day</h1>
      </div>
      <PmError>{dash.error}</PmError>

      {next ? (
        <div className="panel soft">
          <small className="muted">{next.day_of_week === tt.data?.today_day_of_week ? "Next class" : `Next class · ${next.day_label}`}</small>
          <h3 style={{ margin: "4px 0" }}>{`${next.subject_name} · ${next.section_label}`}</h3>
          <p className="muted" style={{ margin: 0 }}>{`${hhmm(next.start_time)} – ${hhmm(next.end_time)}`}</p>
        </div>
      ) : null}

      <div className="section-head">
        <h3>Attendance today</h3>
      </div>
      {dash.loading && !d ? <PmLoading /> : null}
      {d && d.class_teacher_of.length === 0 ? <p className="muted">You are not a class teacher, so there is no daily register to mark.</p> : null}
      {d?.class_teacher_of.map((c) => <RegisterStatus key={c.section_id} sectionId={c.section_id} label={c.section_label} onOpen={() => go(3, `section=${c.section_id}`)} />)}

      <div className="section-head">
        <h3>Today&apos;s classes</h3>
        <button className="text-button blue-text" onClick={() => go(8)}>
          Week ›
        </button>
      </div>
      {d && classes.length === 0 ? <PmEmpty title="No classes today">Nothing on your published timetable for today.</PmEmpty> : null}
      {classes.length ? (
        <div className="panel">
          {classes.map((c) => (
            <div className="item" key={c.period_id}>
              <span>
                <strong>{`${c.subject_name} · ${c.section_label}`}</strong>
                <small className="muted">{`Period ${c.period_number} · ${hhmm(c.start_time)} – ${hhmm(c.end_time)}`}</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="section-head">
        <h3>Quick actions</h3>
      </div>
      {toDecide > 0 ? (
        <button className="action" onClick={() => go(17)}>
          {`Leave to approve · ${plural(toDecide, "request")}`}
        </button>
      ) : null}
      {unread > 0 ? (
        <button className={toDecide > 0 ? "action secondary" : "action"} onClick={() => go(12)}>
          {`Reply to parents · ${plural(unread, "new message")}`}
        </button>
      ) : null}
      <button className={unread > 0 || toDecide > 0 ? "action secondary" : "action"} onClick={() => go(16)}>
        Mark a lesson
      </button>
      <button className="action secondary" onClick={() => go(4)}>
        Check homework
      </button>
      <button className="action secondary" onClick={() => go(5)}>
        Set homework
      </button>
      <button className="action secondary" onClick={() => go(6)}>
        Enter marks
      </button>
      {d && d.unread_notices > 0 ? <p className="micro">{`${plural(d.unread_notices, "unread notice")} from the school.`}</p> : null}
    </>
  );
}

/** One class-teacher section: marked / not yet marked today, and a way in. */
function RegisterStatus({ sectionId, label, onOpen }: { sectionId: number; label: string; onOpen: () => void }) {
  const v = useApi<AttendanceView>("/api/v1/teacher/attendance", { section_id: sectionId, date: todayIso() });
  const s = v.data?.summary;
  const unmarked = s?.unmarked ?? 0;
  let status = <span className="status blue">Checking…</span>;
  if (v.error) status = <span className="status red">Unavailable</span>;
  else if (v.data?.is_holiday) status = <span className="status blue">{v.data.holiday_name ?? "Holiday"}</span>;
  else if (s && unmarked === 0) status = <span className="status">{`Done · ${s.present ?? 0} present, ${s.absent ?? 0} absent`}</span>;
  else if (s) status = <span className="status amber">{`${unmarked} of ${s.total} to mark`}</span>;
  return (
    <button className="item" onClick={onOpen}>
      <span>
        <strong>{label}</strong>
        {status}
      </span>
      <span>›</span>
    </button>
  );
}
