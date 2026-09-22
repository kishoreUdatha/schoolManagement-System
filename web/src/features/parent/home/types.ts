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
  parents: { user_id: number; full_name: string; email: string | null; phone: string | null; relation: string }[];
  attendance: AttendanceSummary;
  homework_recent: HomeworkSnapshot[];
  fees_pending_amount: number;
};

export type Notice = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  attachment_url: string | null;
  sent_at: string | null;
  read_at: string | null;
  status: string;
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
