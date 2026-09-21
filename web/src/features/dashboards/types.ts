// Response shapes the role dashboards read, as the backend sends them.

/** GET /api/v1/school/dashboard and GET /api/v1/principal/dashboard (same shape). */
export type OfficeDashboard = {
  current_academic_year_id: number | null;
  current_academic_year_name: string | null;
  counts: {
    students_active: number;
    teachers_active: number;
    non_teaching_active: number;
    parents_active: number;
    classes_current_year: number;
    sections_current_year: number;
  };
  fees: {
    pending_count: number;
    pending_outstanding: string;
    overdue_count: number;
    overdue_outstanding: string;
    paid_this_month: string;
  };
  admissions: { this_month_count: number; last_30_days_count: number };
  upcoming_holidays: { id: number; name: string; type: string; start_date: string; end_date: string; days: number }[];
  latest_notices: { id: number; title: string; audience: string; sent_at: string | null; recipient_count: number }[];
  upcoming_exams: { id: number; name: string; kind: string; start_date: string; end_date: string; is_published: boolean; papers_count: number }[];
  attendance: {
    available: boolean;
    as_of_date?: string | null;
    marked?: number;
    present?: number;
    absent?: number;
    late?: number;
    half_day?: number;
    attendance_pct?: number;
    note: string | null;
  };
  homework: {
    available: boolean;
    total_homework?: number;
    homework_with_submission?: number;
    total_submissions?: number;
    reviewed_submissions?: number;
    submission_rate_pct?: number;
    review_rate_pct?: number;
    note: string | null;
  };
  exam_performance?: {
    available: boolean;
    exam_id: number | null;
    exam_name: string | null;
    marks_count: number;
    average_pct: number;
    pass_rate_pct: number;
    note: string | null;
  };
  notifications?: { since: string; sent_count: number; total_recipients: number };
  generated_at: string;
};

/** GET /api/v1/school/analytics/overview */
export type AnalyticsOverview = {
  students: number;
  staff: number;
  attendance_this_month: number;
  collected_this_month: string;
  outstanding: string;
  attendance_by_month: { month: string; present: number; absent: number; late: number; half_day: number; percent: number }[];
  money_by_month: { month: string; collected: string; raised: string }[];
};

/** GET /api/v1/principal/approvals */
export type Approval = {
  id: number;
  kind: "marks_correction" | "attendance_edit" | "staff_leave" | "result_publishing";
  status: "pending" | "approved" | "rejected";
  requested_by_name: string | null;
  reason: string | null;
  created_at: string;
};

/** GET /api/v1/teacher/dashboard */
export type TeacherDashboardData = {
  today_iso_date: string;
  today_day_of_week: number;
  todays_classes: {
    period_id: number;
    period_number: number;
    start_time: string;
    end_time: string;
    section_id: number;
    section_label: string;
    subject_name: string;
    subject_code: string;
    is_break: boolean;
  }[];
  class_teacher_of: { section_id: number; section_label: string; class_id: number; capacity: number }[];
  unread_notices: number;
};

/** GET /api/v1/teacher/attendance?section_id&date */
export type SectionAttendance = {
  section_id: number;
  section_label: string | null;
  date: string;
  is_holiday: boolean;
  rows: { student_id: number; status: string | null }[];
};

/** GET /api/v1/teacher/notices (one item) */
export type TeacherNotice = {
  id: number;
  title: string;
  audience: string;
  audience_class_name: string | null;
  audience_section_label: string | null;
  audience_student_label: string | null;
  sent_at: string | null;
  scheduled_at: string | null;
  status: string;
  recipient_count: number;
};

/** GET /api/v1/teacher/homework (one item) */
export type TeacherHomework = {
  id: number;
  subject_name: string;
  class_name: string;
  title: string;
  due_date: string;
  is_past_due: boolean;
  is_closed: boolean;
};

/** GET /api/v1/student/dashboard */
export type StudentDashboardData = {
  student_id: number;
  full_name: string;
  admission_no: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  school_name: string;
  homework: { homework_id: number; title: string; subject_name: string | null; due_date: string; overdue: boolean; submitted: boolean }[];
  homework_due: number;
  homework_overdue: number;
  timetable: { period_number: number; label: string | null; start_time: string; end_time: string; is_break: boolean; subject_name: string | null; teacher_name: string | null }[];
  attendance: { marked_days: number; present: number; absent: number; half_day: number; percent: number };
  recent_exams: { exam_id: number; name: string; end_date: string }[];
  notices: { notice_id: number; title: string; body: string | null; created_at: string }[];
};

/** GET /api/v1/student/exams/{id} (the parts the dashboard reads) */
export type StudentExamResult = {
  exam_id: number;
  exam_name: string;
  is_published: boolean;
  subjects: { exam_paper_id: number; subject_name: string; max_marks: number; marks_obtained: number | null; status: string | null }[];
  summary: { percentage: number; overall_grade: string; is_pass: boolean };
};

/** GET /api/v1/parent/me/children (one child) */
export type Child = {
  id: number;
  full_name: string;
  admission_no: string;
  roll_no: number;
  section_id: number;
  section_label: string | null;
  is_active: boolean;
  attendance_percent: number | null;
  fees_pending_amount: number | null;
  relation: string;
};

/** GET /api/v1/parent/me/children/{id}/timetable */
export type SectionTimetable = {
  section_id: number;
  section_label: string | null;
  periods: { id: number; day_of_week: number; period_number: number; start_time: string; end_time: string; label: string | null; is_break: boolean }[];
  entries: { id: number; period_id: number; subject_name: string; teacher_name: string | null; room_name: string | null }[];
};

/** GET /api/v1/parent/me/notices (one item) */
export type InboxItem = { recipient_id: number; notice_id: number; title: string; body: string; sent_at: string | null; read_at: string | null };

/** GET /api/v1/parent/me/calendar (one item) */
export type CalendarItem = {
  type: string;
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  detail: string | null;
  is_draft: boolean;
  is_cancelled: boolean;
};

/** GET /api/v1/accountant/dashboard */
export type AccountantDashboardData = {
  collected_today: string;
  receipts_today: number;
  collected_this_month: string;
  outstanding: string;
  overdue: string;
  families_owing: number;
  by_month: { month: string; amount: string }[];
};

/** GET /api/v1/school/fees/refunds (one item) */
export type Refund = {
  id: number;
  student_name: string;
  section_label: string | null;
  fee_label: string | null;
  amount: string;
  status: "requested" | "approved" | "rejected" | "processed";
  created_at: string;
};

/** GET /api/v1/staff/dashboard */
export type StaffDashboardData = {
  name: string;
  role: string;
  panels: {
    key: string;
    title: string;
    href: string | null;
    stats: { label: string; value: string | number; tone?: string | null }[];
    todo: string | null;
  }[];
  jobs: string[];
  nothing_assigned: boolean;
};
