/** Response shapes for the learning screens (from the OpenAPI spec). */

export type Homework = {
  id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  due_date: string;
  created_by_name: string | null;
  created_at: string;
  is_past_due: boolean;
  is_closed: boolean;
  rubric_name: string | null;
};

export type SubmissionStatus = "submitted" | "approved" | "rejected";

export type Submission = {
  id: number;
  homework_id: number;
  student_id: number;
  submitted_by_name: string | null;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string;
  status: SubmissionStatus;
  teacher_remark: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  marking: {
    rubric_name: string;
    max_total: number;
    total: number | null;
    criteria: { criterion_id: number; criterion_title: string; max_points: number; points: number | null; comment: string | null }[];
  } | null;
};

export type Period = { id: number; day_of_week: number; period_number: number; start_time: string; end_time: string; label: string | null; is_break: boolean };
export type TimetableEntry = { id: number; period_id: number; subject_name: string; subject_code: string; teacher_name: string | null; room_name: string | null };
export type SectionTimetable = { section_id: number; section_label: string | null; timetable_published_at: string | null; periods: Period[]; entries: TimetableEntry[] };

/** GET …/children/{id}/timetable/day — one dated day, with cover. */
export type TimetableDay = {
  date: string;
  day_of_week: number;
  section_label: string | null;
  holiday_name: string | null;
  slots: {
    period_id: number;
    period_number: number;
    label: string | null;
    start_time: string;
    end_time: string;
    is_break: boolean;
    subject_name: string | null;
    subject_code: string | null;
    teacher_name: string | null;
    room_name: string | null;
    is_substituted: boolean;
    substitute_teacher_name: string | null;
    cover_note: string | null;
  }[];
};

/** GET …/children/{id}/exam-schedule(/{exam_id}) — a datesheet for the child's class. */
export type ExamSchedule = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  is_published: boolean;
  instructions: string | null;
  class_name: string | null;
  section_name: string | null;
  papers: {
    paper_id: number;
    subject_name: string;
    subject_code: string | null;
    exam_date: string;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    max_marks: number;
    syllabus: string | null;
    room_name: string | null;
  }[];
  admit_card_available: boolean;
};

export type ResultSummary = { total_max: number; total_obtained: number; percentage: number; overall_grade: string; is_pass: boolean; subjects_total: number };
export type ExamListItem = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  published_at: string | null;
  summary: ResultSummary;
  result_status: string;
};
export type ExamResult = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  class_name: string | null;
  section_name: string | null;
  subjects: { exam_paper_id: number; subject_name: string; subject_code: string; max_marks: number; pass_marks: number; exam_date: string }[];
};
export type CalendarItem = { type: string; id: number; title: string; start_date: string; end_date: string; is_cancelled: boolean };
