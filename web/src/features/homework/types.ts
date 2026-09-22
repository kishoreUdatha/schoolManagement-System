// Shapes returned by the teacher, student and parent portals for Homework & Assignments.

import type { Attachment } from "@/components/ui/Attachments";

/** One class-subject the teacher teaches (GET /teacher/my-classes → subject_teacher_of). */
export type SubjectCard = {
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

export type MyClasses = { subject_teacher_of: SubjectCard[] };

/** HomeworkRead: the same serialiser for teacher, student and parent. */
export type Homework = {
  id: number;
  class_subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  due_date: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
  is_past_due: boolean;
  can_edit: boolean;
  rubric_id: number | null;
  rubric_name: string | null;
  is_closed: boolean;
  publish_on: string | null;
  is_scheduled: boolean;
  closed_at: string | null;
  closed_by_name: string | null;
  /** Uploaded files; attachment_url is the older link field and still works. */
  attachments: Attachment[];
};

export type SubmissionStatus = "submitted" | "approved" | "rejected";

export type MarkedCriterion = {
  criterion_id: number;
  criterion_title: string;
  description?: string | null;
  max_points: number;
  points: number | null;
  comment: string | null;
};

export type Marking = { rubric_id: number; rubric_name: string; max_total: number; total: number | null; criteria: MarkedCriterion[] };

export type Submission = {
  id: number;
  homework_id: number;
  student_id: number;
  student_admission_no: string | null;
  student_name: string | null;
  submitted_by_user_id: number | null;
  submitted_by_name: string | null;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string;
  status: SubmissionStatus;
  teacher_remark: string | null;
  reviewed_by_user_id: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  marking: Marking | null;
  /** Files handed in with the work. */
  files: Attachment[];
  /** The teacher's files on the evaluation (marked copy, feedback). */
  review_files: Attachment[];
};

export type Rubric = {
  id: number;
  name: string;
  description: string | null;
  subject_id: number | null;
  subject_name: string | null;
  is_active: boolean;
  max_total: number;
  criteria: { id: number; title: string; description: string | null; max_points: number; sequence: number }[];
};

export type ProjectKind = "individual" | "group";

export type Project = {
  id: number;
  class_subject_id: number;
  class_name: string | null;
  subject_name: string | null;
  subject_code: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  deadline: string;
  kind: ProjectKind;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
  is_past_due: boolean;
  progress_count: number;
  eligible_student_count: number;
  attachments: Attachment[];
};

export type ProgressStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

/** One student's row on a project; id 0 means the student has not started. */
export type Progress = {
  id: number;
  project_id: number;
  student_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  status: ProgressStatus;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string | null;
  teacher_remark: string | null;
  rating: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  updated_at: string;
  /** The teacher's files on the review. */
  review_files: Attachment[];
};

/** GET /parent/me/children */
export type Child = { id: number; full_name: string; admission_no: string; roll_no: number | null; section_id: number; section_label: string | null };

/** GET /student/me */
export type StudentMe = { student_id: number; full_name: string; admission_no: string; roll_no: number | null; class_name: string | null; section_name: string | null };
