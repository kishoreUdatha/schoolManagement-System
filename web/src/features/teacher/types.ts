// Shapes returned by the teacher portal (/api/v1/teacher/*) for the
// teacher's own classes, students, behaviour ratings and weekly reports.

export type ClassTeacherCard = {
  section_id: number;
  class_id: number;
  section_name: string;
  class_name: string;
  section_label: string;
  academic_year_id: number;
  academic_year_name: string;
  is_current_year: boolean;
  capacity: number;
  student_count: number;
};

export type SubjectTeacherCard = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  is_optional: boolean;
  academic_year_id: number;
  academic_year_name: string;
  is_current_year: boolean;
  sections: { section_id: number; section_name: string; student_count: number }[];
  total_students: number;
};

/** GET /teacher/my-classes */
export type MyClasses = { class_teacher_of: ClassTeacherCard[]; subject_teacher_of: SubjectTeacherCard[] };

/** GET /teacher/sections/{id}/students */
export type RosterStudent = {
  id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  gender: string | null;
  dob: string | null;
  photo_url: string | null;
};

/** GET /teacher/students/{id} */
export type StudentProfile = {
  id: number;
  admission_no: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  photo_url: string | null;
  address: string | null;
  is_active: boolean;
  roll_no: number;
  section_id: number;
  section_name: string | null;
  class_id: number | null;
  class_name: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  parents: { user_id: number; full_name: string; email: string | null; phone: string | null; relation: string }[];
  attendance: { days_present: number; days_absent: number; days_late: number; days_half_day: number; days_marked: number; attendance_percent: number | null };
  behaviour_recent: {
    id: number;
    period_kind: string;
    period_key: string;
    average: number;
    punctuality: number;
    participation: number;
    discipline: number;
    respect: number;
    teacher_note: string | null;
    rated_by_name: string | null;
    created_at: string;
  }[];
  exams: { exam_id: number; exam_name: string; exam_kind: string; published_at: string | null; percentage: number; overall_grade: string; is_pass: boolean }[];
  homework_recent: { id: number; title: string; subject_name: string | null; subject_code: string | null; due_date: string; is_past_due: boolean }[];
  fees_pending_amount: number;
};

export type PeriodKind = "weekly" | "monthly";

/** BehaviourRatingRead */
export type Rating = {
  id: number;
  student_id: number;
  student_name: string | null;
  rated_by_user_id: number | null;
  rated_by_name: string | null;
  period_kind: PeriodKind;
  period_key: string;
  punctuality: number;
  participation: number;
  discipline: number;
  respect: number;
  average: number;
  teacher_note: string | null;
  ai_suggested: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

/** GET /teacher/behaviour/section/{id} */
export type SectionView = {
  section_id: number;
  section_label: string | null;
  period_kind: PeriodKind;
  period_key: string;
  rows: { student_id: number; admission_no: string; roll_no: number; full_name: string; rating: Rating | null }[];
};

/** POST /teacher/behaviour/ai-suggest */
export type Suggestion = { punctuality: number; participation: number; discipline: number; respect: number; rationale: string; source: string };

/** WeeklyReportRead */
export type WeeklyReport = {
  id: number;
  student_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  week_start: string;
  week_end: string;
  attendance_marked: number;
  attendance_present: number;
  attendance_absent: number;
  attendance_late: number;
  attendance_half_day: number;
  attendance_pct: number;
  homework_total: number;
  homework_submitted: number;
  homework_submission_pct: number;
  marks_summary: { papers?: number; avg_pct?: number; pass_rate_pct?: number } | null;
  behaviour_avg: number | null;
  teacher_remark: string | null;
  generated_by_name: string | null;
  shared_at: string | null;
  created_at: string;
};
