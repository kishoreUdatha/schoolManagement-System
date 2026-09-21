// Shapes returned by the timetable, period and cover endpoints.

export type AcademicYear = { id: number; name: string; is_current: boolean };

export type Section = { id: number; class_id: number; name: string; capacity: number };

export type SchoolClass = { id: number; name: string; academic_year_id: number; sections: Section[] };

/** GET /school/periods: one row per day and period number. */
export type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

export type Entry = {
  id: number;
  section_id: number;
  period_id: number;
  class_subject_id: number;
  subject_name: string;
  subject_code: string;
  teacher_user_id: number | null;
  teacher_name: string | null;
  room_id: number | null;
  room_name: string | null;
  notes: string | null;
};

/** GET /school/sections/{id}/timetable */
export type SectionTimetable = {
  section_id: number;
  section_label: string | null;
  timetable_published_at: string | null;
  periods: Period[];
  entries: Entry[];
};

/** GET /school/classes/{id}/subjects */
export type ClassSubject = {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_user_id: number | null;
  is_optional: boolean;
  subject: { id: number; name: string; code: string };
};

export type ExamRoom = { id: number; name: string; capacity: number };

/** GET /school/timetable-gen/dashboard */
export type Dashboard = {
  teaching_slots_per_week: number;
  sections: { section_id: number; class_name: string; section_name: string; filled: number; slots: number; percent: number; empty: number }[];
  complete: number;
  not_started: number;
  percent: number;
  clashes: { teacher_id: number; teacher_name: string | null; day_of_week: number | null; period_number: number | null; sections: number }[];
};

/** GET /school/timetable-gen/coordinator?day_of_week= */
export type DayView = {
  day_of_week: number;
  periods: { period_number: number; label: string | null; start_time: string; end_time: string; is_break: boolean }[];
  sections: { section_id: number; label: string; lessons: Record<string, { subject_name: string; teacher_name: string | null; room_name: string | null }> }[];
};

/** GET /school/timetable-gen/sections/{id}/requirements */
export type Requirements = {
  section_id: number;
  teaching_slots_per_week: number;
  periods_wanted: number;
  fits: boolean;
  over_by: number;
  unset: string[];
  subjects: {
    class_subject_id: number;
    subject_name: string;
    teacher_name: string | null;
    has_teacher: boolean;
    periods_per_week: number;
    placed: number;
    short_by: number;
    over_by: number;
  }[];
};

/** POST /school/timetable-gen/sections/{id}/generate */
export type GenResult = {
  section_id: number;
  placed: number;
  entries: { class_subject_id: number; subject_name: string; day_of_week: number; period_number: number }[];
  unplaced: { class_subject_id: number; subject_name: string; still_short: number; because: string }[];
  left_empty: number;
  complete: boolean;
};

/** GET /teacher/timetable */
export type TeacherLesson = {
  entry_id: number;
  section_id: number;
  section_label: string;
  class_name: string;
  subject_name: string;
  subject_code: string;
  period_id: number;
  period_number: number;
  period_label: string | null;
  start_time: string;
  end_time: string;
  is_break: boolean;
  day_of_week: number;
  day_label: string;
  notes: string | null;
};
export type TeacherWeek = {
  today_day_of_week: number;
  today_label: string;
  today: TeacherLesson[];
  by_day: { day_of_week: number; day_label: string; is_today: boolean; items: TeacherLesson[] }[];
  total_entries: number;
};

/** GET /parent/me/children */
export type Child = { id: number; full_name: string; section_id: number; section_label: string | null };

/** GET /school/directory/staff */
export type StaffLite = { user_id: number; full_name: string; role: string };

/** GET /school/cover/unavailability */
export type Block = { id: number; user_id: number; full_name: string; day_of_week: number; period_number: number | null; reason: string | null };

/** GET /school/cover/day */
export type CoverSlot = {
  timetable_entry_id: number;
  period_id: number;
  period_number: number;
  start_time: string;
  end_time: string;
  section_id: number;
  section_label: string;
  subject_name: string;
  absent_user_id: number | null;
  absent_name: string | null;
  reason: string;
  substitution_id: number | null;
  substitute_user_id: number | null;
  substitute_name: string | null;
  note: string | null;
};
export type CoverDay = {
  date: string;
  day_of_week: number;
  is_holiday: boolean;
  absent: { user_id: number; full_name: string; reason: string; periods: number }[];
  slots: CoverSlot[];
  covered: number;
  uncovered: number;
};

/** GET /school/cover/candidates */
export type Candidate = {
  user_id: number;
  full_name: string;
  status: "free" | "busy_teaching" | "busy_covering" | "on_leave" | "unavailable";
  detail: string | null;
  teaches_this_class: boolean;
  covers_this_week: number;
  periods_today: number;
};
