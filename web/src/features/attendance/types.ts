// Shapes returned by the attendance endpoints (teacher, school and parent portals).

export type Status = "present" | "absent" | "late" | "half_day";
export const STATUSES: Status[] = ["present", "absent", "late", "half_day"];

export type AcademicYear = { id: number; name: string; is_current: boolean };
export type Section = { id: number; name: string };
export type SchoolClass = { id: number; name: string; sections: Section[] };

export type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

/** GET /teacher/my-classes */
export type MyClasses = {
  class_teacher_of: { section_id: number; section_label: string; is_current_year: boolean; student_count: number }[];
  subject_teacher_of: { subject_name: string; sections: { section_id: number; section_name: string }[]; class_name: string }[];
};

/** GET /teacher/attendance */
export type DayRow = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  status: Status | null;
  remark: string | null;
  on_leave: string | null;
  marked_at: string | null;
};
export type DayView = {
  section_id: number;
  section_label: string | null;
  date: string;
  is_holiday: boolean;
  holiday_name: string | null;
  is_editable: boolean;
  is_locked: boolean;
  locked_at: string | null;
  edit_window_days: number;
  rows: DayRow[];
};

/** GET /teacher/timetable */
export type TimetableEntry = {
  entry_id: number;
  section_id: number;
  section_label: string;
  subject_name: string | null;
  period_id: number;
  period_number: number;
  period_label: string | null;
  start_time: string;
  end_time: string;
  is_break: boolean;
  day_of_week: number;
};
export type TeacherTimetable = { by_day: { day_of_week: number; day_label: string; items: TimetableEntry[] }[] };

/** GET /school/attendance-ops/periods */
export type LessonRow = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  status: Status;
  remark: string | null;
  already_marked: boolean;
  day_status: Status | null;
};
export type LessonGrid = {
  section_id: number;
  date: string;
  period_id: number;
  period_number: number;
  period_label: string | null;
  start_time: string;
  end_time: string;
  subject_name: string | null;
  rows: LessonRow[];
  marked: number;
};

/** GET /school/reports/attendance/student-monthly */
export type StudentMonthly = {
  section_id: number;
  section_label: string;
  year: number;
  month: number;
  from_date: string;
  to_date: string;
  rows: { student_id: number; admission_no: string; roll_no: number | null; full_name: string; present: number; absent: number; late: number; half_day: number; marked_days: number; attendance_pct: number | null }[];
};

/** GET /school/reports/attendance/students/{id} */
export type StudentHistory = { student_id: number; days: { date: string; status: Status; remark: string | null }[] };

/** GET /school/reports/attendance/class-summary */
export type ClassSummaryRow = {
  class_id: number;
  class_name: string;
  section_id: number;
  section_name: string;
  total_marks: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  distinct_days: number;
  distinct_students: number;
  attendance_pct: number | null;
};

/** GET /school/reports/attendance/daily-absent */
export type DailyAbsentRow = { student_id: number; admission_no: string; full_name: string; roll_no: number | null; class_name: string; section_name: string; remark: string | null };

/** GET /school/attendance-ops/corrections */
export type Correction = {
  id: number;
  student_id: number;
  student_name: string | null;
  admission_no: string | null;
  section_label: string | null;
  date: string;
  from_status: Status | null;
  to_status: Status;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

/** GET /school/student-leaves and /parent/me/children/{id}/leaves */
export type StudentLeave = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string;
  kind: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  applied_by_name: string | null;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  can_decide?: boolean;
};
export const LEAVE_KINDS = ["sick", "family", "travel", "religious", "other"];

/** GET /parent/me/children */
export type Child = { id: number; full_name: string; admission_no: string; section_label: string | null };

/** GET /school/attendance-ops/times */
export type TimesRow = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  date: string;
  status: string;
  arrived_at: string | null;
  left_at: string | null;
  remark: string | null;
  times_in_window: number;
};
export type TimesWindow = { from_date: string; to_date: string; rows: TimesRow[]; count: number };

/** GET /school/attendance-ops/at-risk */
export type AtRiskStudent = {
  student_id: number;
  admission_no: string;
  student_name: string;
  section_label: string | null;
  marked_days: number;
  present_days: number;
  absent_days: number;
  percent: number;
  last_contact_on: string | null;
  last_contact_method: string | null;
  last_contact_note: string | null;
  follow_up_on: string | null;
  follow_up_due: boolean;
  never_contacted: boolean;
};
export type AtRisk = { below: number; from_date: string; to_date: string; students: AtRiskStudent[]; count: number; never_contacted: number; follow_ups_due: number };
export type Contact = {
  id: number;
  contacted_on: string;
  method: string;
  spoke_to: string | null;
  note: string;
  agreed_action: string | null;
  follow_up_on: string | null;
  recorded_by: string | null;
};
export const CONTACT_METHODS = ["phone", "message", "email", "meeting", "home_visit"];

/** GET /school/profile (school admin only) */
export type SchoolProfile = { timezone: string | null; working_days: string | null };

export type StudentHit = { id: number; full_name: string; admission_no: string };

/** Form ids and page-head events, shared by the (server) pages and the screens.
 *  Kept here, outside the "use client" modules, so pages can use the values. */
export const DAILY_FORM = "daily-attendance-form";
export const LESSON_FORM = "lesson-attendance-form";
export const EV = {
  exportRegister: "attendance:export-register",
  approveCorrection: "attendance:approve-correction",
  approveLeave: "attendance:approve-leave",
  requestLeave: "attendance:request-leave",
  exportLeaves: "attendance:export-leaves",
  recordTime: "attendance:record-time",
  exportTimes: "attendance:export-times",
  exportMonthly: "attendance:export-monthly",
  exportReport: "attendance:export-report",
} as const;
