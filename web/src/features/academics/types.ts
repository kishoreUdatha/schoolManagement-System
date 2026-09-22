// Shapes returned by /api/v1/school/* for the Academics setup screens
// (SCR-092 to SCR-100). The planning screens keep theirs in planTypes.ts.

export type AcademicYear = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
  admissions_open: boolean;
  admission_opens_on: string | null;
};

/** working_days is the school's own count (null = not set); school_days is worked out from the calendar. */
export type Term = {
  id: number;
  academic_year_id: number;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  working_days: number | null;
  school_days: number | null;
};

export type Section = {
  id: number;
  class_id: number;
  name: string;
  capacity: number;
  class_teacher_user_id: number | null;
  /** The room (Facilities) the section sits in. */
  room_id: number | null;
  room_name: string | null;
};

export type SchoolClass = {
  id: number;
  name: string;
  display_order: number;
  academic_year_id: number;
  code: string | null;
  school_level: string | null;
  capacity: number | null;
  coordinator_user_id: number | null;
  coordinator_name: string | null;
  is_active: boolean;
  sections: Section[];
};

export type SubjectKind = "core" | "elective";

export type Subject = {
  id: number;
  name: string;
  code: string;
  kind: SubjectKind;
  display_order: number;
  is_active: boolean;
  department_id: number | null;
};

export type ClassSubject = {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_user_id: number | null;
  is_optional: boolean;
  display_order: number;
  subject: Subject;
};

export type Department = { id: number; name: string; code: string; is_active: boolean };

export type StaffMember = { id: number; user_id: number; full_name: string; designation: string | null; role: string; is_active: boolean };

export type GroupMember = { member_id: number; subject_id: number; subject_name: string; subject_code: string; is_elective: boolean };

export type SubjectGroup = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  /** Class it is offered to (null = every class) and how many subjects a student picks from it. */
  class_id: number | null;
  class_name: string | null;
  min_picks: number | null;
  max_picks: number | null;
  subjects: GroupMember[];
  subject_count: number;
  elective_count: number;
};

export type CurriculumSubject = {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  periods_per_week: number;
  is_core: boolean;
};

export type CurriculumState = "draft" | "active" | "retired";

export type Curriculum = {
  id: number;
  name: string;
  board: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  class_id: number | null;
  class_name: string | null;
  status: CurriculumState;
  effective_from: string | null;
  notes: string | null;
  subjects: CurriculumSubject[];
  subject_count: number;
  periods_per_week: number;
  retired?: { id: number; name: string }[];
};

export type SectionProgress = { section_id: number; section_label: string; covered: number; total: number; percent: number; behind: number };

export type ClassSubjectSummary = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  teacher_user_id: number | null;
  teacher_name: string | null;
  chapters: number;
  topics: number;
  can_edit: boolean;
  sections: SectionProgress[];
};

export type Coverage = { covered_on: string; note: string | null; lesson_plan_id: number | null };

export type Topic = { id: number; title: string; sequence: number; planned_periods: number | null; coverage: Record<string, Coverage> };

export type Chapter = {
  id: number;
  title: string;
  sequence: number;
  description: string | null;
  planned_start: string | null;
  planned_end: string | null;
  planned_periods: number | null;
  topics: Topic[];
};

export type SyllabusDetail = ClassSubjectSummary & { items: Chapter[] };

export type CopySource = { class_subject_id: number; class_name: string; chapters: number };
