// Shapes returned by the backend for the Examinations module
// (/api/v1/school/exams, /school/exam-ops, /teacher/marks, /student/exams …).

export type ExamKind = "unit_test" | "mid_term" | "term" | "final" | "other";
export const EXAM_KINDS: [ExamKind, string][] = [
  ["unit_test", "Unit test"],
  ["mid_term", "Mid-term"],
  ["term", "Term"],
  ["final", "Final"],
  ["other", "Other"],
];

export type Paper = {
  id: number;
  exam_id: number;
  class_subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  max_marks: number;
  pass_marks: number;
  exam_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  marks_entered_count: number;
  marks_verified_at: string | null;
  marks_verified_by_name: string | null;
  marks_verified_count: number | null;
};

export type Exam = {
  id: number;
  academic_year_id: number;
  academic_year_name: string | null;
  name: string;
  kind: ExamKind;
  start_date: string;
  end_date: string;
  is_published: boolean;
  published_at: string | null;
  term_id: number | null;
  exam_type_id: number | null;
  exam_type_name: string | null;
  grade_scale_id: number | null;
  results_approved_at: string | null;
  marks_open: boolean;
  marks_closed_at: string | null;
  revision_no: number;
  created_at: string;
  papers: Paper[];
  papers_count: number;
  total_marks_entered: number;
};

export type Blocker = { kind: string; count: number; detail: string };

export type DashboardPaper = {
  paper_id: number;
  class_subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_id: number | null;
  class_name: string | null;
  exam_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number;
  pass_marks: number;
  candidates: number;
  marks_entered: number;
  marks_complete: boolean;
  verified: boolean;
  allocated: number;
  rooms_used: number;
  fully_allocated: boolean;
  invigilators: number;
  invigilators_missing: boolean;
};

export type ExamDashboard = {
  exam_id: number;
  exam_name: string;
  kind: string;
  start_date: string;
  end_date: string;
  is_published: boolean;
  marks_open: boolean;
  results_approved_at: string | null;
  papers: number;
  candidates: number;
  marks_entered: number;
  marks_percent: number;
  papers_verified: number;
  papers_allocated: number;
  rows: DashboardPaper[];
  blockers: Blocker[];
  ready_to_publish: boolean;
};

export type PaperLabel = {
  paper_id: number;
  subject_name: string;
  subject_code: string | null;
  class_id: number | null;
  class_name: string | null;
  exam_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number;
  pass_marks: number;
};

export type DatesheetPaper = PaperLabel & { ends_at: string; has_time: boolean };
export type Datesheet = {
  exam_id: number;
  exam_name: string;
  start_date: string;
  end_date: string;
  days: { date: string; papers: DatesheetPaper[] }[];
  clashes: { class_id: number; class_name: string | null; exam_date: string; papers: PaperLabel[] }[];
  papers_without_time: number;
};

export type ExamType = {
  id: number;
  name: string;
  code: string;
  weight_percent: string | null;
  display_order: number;
  is_active: boolean;
  exams: number;
};

export type Band = {
  grade: string;
  min_percent: string | number;
  max_percent: string | number;
  points: string | number | null;
  remark: string | null;
  is_pass: boolean;
};

export type GradeScale = {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  used_by_exams: number;
  bands: Band[];
};

export type ExamRoom = { id: number; name: string; code: string; kind: string; capacity: number; building: string | null; floor: string | null };

export type SeatedStudent = { student_id: number; admission_no: string; student_name: string; roll_no: number | null; section_name: string | null };

export type Allocation = PaperLabel & {
  candidates: number;
  seated: number;
  rooms: { room_id: number; room_name: string; capacity: number; seated: number; over_capacity: boolean; students: SeatedStudent[] }[];
  unplaced: SeatedStudent[];
};

export type DutyStaff = { invigilation_id: number; user_id: number; name: string; role: string; is_chief: boolean };
export type RoomDuty = { room_id: number; room_name: string; seated: number; staff: DutyStaff[] };
export type Invigilators = PaperLabel & { rooms: RoomDuty[]; unwatched: RoomDuty[] };
export type AvailableStaff = { user_id: number; name: string; role: string; assigned_here: boolean; clash: string | null; available: boolean };
export type DutyRoster = {
  exam_id: number;
  total_duties: number;
  staff: {
    user_id: number;
    name: string;
    role: string;
    count: number;
    duties: { paper_id: number; subject_name: string; class_name: string | null; exam_date: string; start_time: string | null; room_name: string; is_chief: boolean }[];
  }[];
};

export type AdmitCard = {
  exam_id: number;
  exam_name: string;
  school_name: string;
  school_address: string | null;
  student_id: number;
  student_name: string;
  admission_no: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  sittings: {
    paper_id: number;
    subject_name: string;
    subject_code: string | null;
    exam_date: string;
    start_time: string | null;
    ends_at: string;
    duration_minutes: number | null;
    max_marks: number;
    room_name: string | null;
    building: string | null;
  }[];
  rooms_allocated: number;
};

export type MarkStatus = "scored" | "absent" | "exempt";

export type MyPaper = {
  exam_paper_id: number;
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  exam_is_published: boolean;
  subject_name: string;
  subject_code: string;
  class_id: number;
  class_name: string;
  exam_date: string;
  max_marks: number;
  pass_marks: number;
  duration_minutes: number | null;
  section_count: number;
  students_in_class: number;
  marks_entered: number;
};

export type MarkRow = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  status: MarkStatus | null;
  marks_obtained: number | null;
  grade: string | null;
  is_pass: boolean | null;
  remark: string | null;
};

export type MarksView = {
  exam_id: number;
  exam_name: string;
  exam_paper_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_id: number;
  class_name: string | null;
  section_id: number;
  section_label: string | null;
  max_marks: number;
  pass_marks: number;
  exam_date: string;
  is_published: boolean;
  is_editable: boolean;
  rows: MarkRow[];
  summary: { scored?: number; absent?: number; exempt?: number; unmarked?: number; pass?: number; fail?: number };
};

export type MarksSaveResult = { saved: number; skipped: number; errors: { student_id?: number; error?: string }[] };

export type MyClasses = {
  class_teacher_of: { section_id: number; class_id: number; section_label: string; class_name: string }[];
  subject_teacher_of: {
    class_subject_id: number;
    class_id: number;
    class_name: string;
    subject_name: string;
    subject_code: string;
    sections: { section_id: number; section_name: string; student_count: number }[];
  }[];
};

export type ComponentHead = { id: number; name: string; max_marks: number; pass_marks: number };
export type Components = PaperLabel & { components: (ComponentHead & { sequence: number })[]; allocated: number; unallocated: number };
export type ComponentMarkRow = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  section_name: string | null;
  status: string;
  total: number | null;
  values: Record<string, number | null>;
};
export type ComponentMarks = PaperLabel & { components: ComponentHead[]; rows: ComponentMarkRow[] };

export type ImportJob = {
  id: number;
  import_type: string;
  status: "uploaded" | "checked" | "imported" | "failed" | "cancelled";
  file_name: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  errors: { row: number | null; value: string | null; error: string | null }[];
  message: string | null;
  created_by_name: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ResultSummary = {
  total_max: number;
  total_obtained: number;
  percentage: number;
  overall_grade: string;
  overall_points: number | null;
  is_pass: boolean;
  subjects_total: number;
  subjects_passed: number;
  subjects_failed: number;
  subjects_absent: number;
  subjects_exempt: number;
  subjects_pending: number;
};

export type ExamListItem = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  published_at: string | null;
  summary: ResultSummary;
  result_status: string;
  parent_note: string | null;
};

export type ExamResult = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  is_published: boolean;
  published_at: string | null;
  student_id: number;
  student_name: string;
  student_admission_no: string;
  student_roll_no: number;
  class_name: string | null;
  section_name: string | null;
  subjects: {
    exam_paper_id: number;
    subject_name: string;
    subject_code: string;
    max_marks: number;
    pass_marks: number;
    exam_date: string;
    status: string | null;
    marks_obtained: number | null;
    grade: string | null;
    is_pass: boolean | null;
    remark: string | null;
  }[];
  summary: ResultSummary;
  result_status: string;
  parent_note: string | null;
  rank: number | null;
  class_size: number | null;
  attendance_percent: number | null;
  teacher_remark: string | null;
  principal_remark: string | null;
};

export type PromotionRow = {
  student_id: number;
  admission_no: string;
  student_name: string;
  class_id: number;
  class_name: string | null;
  section_name: string | null;
  subjects: number;
  passed: number;
  failed: number;
  absent: number;
  unmarked: number;
  obtained: number;
  out_of: number;
  percent: number;
  suggestion: "promoted" | "repeated" | "review" | string;
  because: string;
};

export type PromotionPreview = {
  exam_id: number;
  exam_name: string;
  is_published: boolean;
  students: PromotionRow[];
  counts: Record<string, number>;
  total: number;
};

export type ChildOverview = { id: number; full_name: string; admission_no: string; roll_no: number; section_id: number; section_label: string | null };

export type ClassSubject = { id: number; class_id: number; subject_id: number; subject: { id: number; name: string; code: string } };

export type Term = { id: number; name: string };
