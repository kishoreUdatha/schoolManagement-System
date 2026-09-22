/** Response shapes used by the home and profile screens (from the OpenAPI spec). */

export type AttendanceSummary = {
  days_present: number;
  days_absent: number;
  days_late: number;
  days_half_day: number;
  days_marked: number;
  attendance_percent: number | null;
};

export type HomeworkSnapshot = { id: number; title: string; subject_name: string | null; subject_code: string | null; due_date: string; is_past_due: boolean };

export type StudentProfile = {
  id: number;
  admission_no: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  photo_url: string | null;
  is_active: boolean;
  roll_no: number;
  section_id: number;
  section_name: string | null;
  class_id: number | null;
  class_name: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  class_teacher_name: string | null;
  parents: { user_id: number; full_name: string; email: string | null; phone: string | null; relation: string }[];
  attendance: AttendanceSummary;
  homework_recent: HomeworkSnapshot[];
  fees_pending_amount: number;
};

export type NoticeCategory = "attendance" | "fees" | "exams" | "homework" | "events" | "general";

export type Notice = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  attachment_url: string | null;
  category: NoticeCategory;
  /** In-app path to the record the notice is about, e.g. "/parent/fees". */
  link: string | null;
  /** The child it is about, when it is about one child. */
  student_id: number | null;
  event_date: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  event_venue: string | null;
  sent_at: string | null;
  read_at: string | null;
  status: string;
};

/** GET …/children/{id}/attendance/day — one day's register mark and lessons. */
export type AttendanceStatus = "present" | "absent" | "late" | "half_day";
export type AttendanceDay = {
  date: string;
  status: AttendanceStatus | null;
  remark: string | null;
  arrived_at: string | null;
  left_at: string | null;
  marked_by_name: string | null;
  marked_at: string | null;
  holiday_name: string | null;
  on_approved_leave: boolean;
  periods: { period_id: number; period_number: number; label: string | null; start_time: string; end_time: string; subject_name: string | null; status: AttendanceStatus; remark: string | null }[];
};

/** GET …/children/{id}/attendance/month — day-by-day marks for a month. */
export type AttendanceMonth = {
  month: string;
  days: { date: string; status: AttendanceStatus; remark: string | null; arrived_at: string | null; left_at: string | null }[];
  holidays: { date: string; name: string }[];
  totals: { present: number; absent: number; late: number; half_day: number; marked: number; attendance_percent: number | null };
};

export type ChildTransport = {
  route_name: string;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: string;
  vehicle_label: string | null;
  registration_no: string | null;
};

export type ParentPtm = {
  id: number;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  is_published: boolean;
  booking_open: boolean;
  eligible_children: number[];
};

export type FeeRow = { id: number; fee_head_name: string; period: string; amount_outstanding: string; due_date: string; status: string; is_overdue: boolean };
