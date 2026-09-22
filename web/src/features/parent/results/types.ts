// Shapes from GET /parent/me/children/{id}/exams and …/exams/{exam_id}.

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

export type SubjectResult = {
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
  subjects: SubjectResult[];
  summary: ResultSummary;
  result_status: string;
  result_version: number;
  override_reason: string | null;
  parent_note: string | null;
  rank: number | null;
  class_size: number | null;
  attendance_percent: number | null;
  teacher_remark: string | null;
  principal_remark: string | null;
};
