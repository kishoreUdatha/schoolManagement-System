export type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

export type SectionEntry = {
  id: number;
  section_id: number;
  period_id: number;
  class_subject_id: number;
  subject_name: string;
  subject_code: string;
  teacher_user_id: number | null;
  teacher_name: string | null;
  notes: string | null;
};

export type ClassSubjectOption = {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  teacher_user_id: number | null;
  teacher_name: string | null;
};

export type SectionTimetable = {
  section_id: number;
  section_label: string | null;
  class_id: number | null;
  class_name: string | null;
  section_name: string | null;
  timetable_published_at: string | null;
  periods: Period[];
  entries: SectionEntry[];
  class_subjects: ClassSubjectOption[];
  skipped: string[];
};

export type TeacherWeekEntry = {
  id: number;
  section_id: number;
  section_label: string;
  period_id: number;
  class_subject_id: number;
  subject_name: string;
  subject_code: string;
  notes: string | null;
  published: boolean;
};

export type TeacherWeek = {
  teacher_user_id: number;
  teacher_name: string;
  periods: Period[];
  entries: TeacherWeekEntry[];
};

export type Scope = {
  role: string;
  school_wide: boolean;
  is_hod: boolean;
  academic_years: { id: number; name: string; is_current: boolean }[];
  classes: {
    id: number;
    name: string;
    academic_year_id: number;
    sections: { id: number; name: string; published: boolean }[];
  }[];
};

export type TeacherLite = { id: number; full_name: string };

export type Clash = {
  teacher_user_id: number;
  teacher_name: string | null;
  day_of_week: number;
  period_number: number;
  sections: { section_id: number; section_label: string; subject_name: string }[];
};

/** A slot as the grid renders it, independent of class vs teacher view. */
export type GridCell = {
  key: number;
  subject_name: string;
  subject_code: string;
  /** Teacher name in class view, section label in teacher view. */
  subtitle: string | null;
  notes: string | null;
  draft?: boolean;
};
