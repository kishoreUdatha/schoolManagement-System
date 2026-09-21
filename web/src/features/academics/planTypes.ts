// Shapes returned by /api/v1/school/* for Academics screens SCR-101 to SCR-109
// (outcomes, lesson plans, syllabus progress, resources, rooms, calendar, activities).

export type SyllabusSection = { section_id: number; section_label: string; covered: number; total: number; percent: number; behind: number };

/** GET /syllabus: one row per class-subject. */
export type ClassSubject = {
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
  sections: SyllabusSection[];
};

export type Topic = { id: number; title: string; sequence: number; planned_periods: number | null };
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

/** GET /syllabus/{cs_id}. */
export type SyllabusDetail = ClassSubject & { items: Chapter[] };

export type PlanStatus = "draft" | "submitted" | "approved" | "returned";

export type LessonPlan = {
  id: number;
  teacher_user_id: number;
  teacher_name: string;
  class_subject_id: number;
  subject_name: string;
  section_id: number;
  section_label: string;
  plan_date: string;
  periods: number;
  title: string;
  objectives: string | null;
  activities: string | null;
  resources: string | null;
  assessment: string | null;
  homework: string | null;
  status: PlanStatus;
  submitted_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  delivered_on: string | null;
  delivery_note: string | null;
  topics: { id: number; title: string; chapter_title: string }[];
};

export const BLOOM = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;
export type OutcomeStatus = "covered" | "in_progress" | "not_started";

export type Outcome = {
  id: number;
  class_subject_id: number;
  chapter_id: number | null;
  chapter_title: string | null;
  code: string;
  statement: string;
  bloom_level: (typeof BLOOM)[number] | null;
  sequence: number;
  is_active: boolean;
  topics: { id: number; title: string }[];
  topics_covered?: number | null;
  status?: OutcomeStatus | null;
};

export type OutcomeCoverage = {
  class_subject_id: number;
  subject_name: string;
  section_id: number;
  section_label: string | null;
  total: number;
  covered: number;
  in_progress: number;
  not_started: number;
  unmapped: number;
  outcomes: Outcome[];
};

export const RESOURCE_KINDS = ["document", "worksheet", "presentation", "link", "video", "image", "other"] as const;

export type Resource = {
  id: number;
  class_subject_id: number;
  subject_name: string | null;
  chapter_id: number | null;
  chapter_title: string | null;
  topic_id: number | null;
  topic_title: string | null;
  title: string;
  description: string | null;
  kind: (typeof RESOURCE_KINDS)[number];
  url: string | null;
  file_name: string | null;
  size_bytes: number | null;
  has_file: boolean;
  visible_to_parents: boolean;
  downloads: number;
  uploaded_by_name: string | null;
  created_at: string;
  is_active: boolean;
};

export const ROOM_KINDS = ["classroom", "lab", "computer_lab", "library", "hall", "sports", "staff_room", "office", "other"] as const;

export type Room = {
  id: number;
  name: string;
  code: string;
  kind: (typeof ROOM_KINDS)[number];
  capacity: number | null;
  building: string | null;
  floor: string | null;
  branch_id: number | null;
  branch_name: string | null;
  section_id: number | null;
  section_label: string | null;
  notes: string | null;
  is_active: boolean;
};

export type CalendarItem = {
  type: "event" | "holiday" | "exam" | "ptm" | "ptm_slot" | string;
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  detail?: string | null;
  is_draft?: boolean;
  is_cancelled?: boolean;
};

export const ACTIVITY_KINDS = ["club", "sport", "arts", "service", "other"] as const;

export type RosterRow = {
  member_id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  joined_on: string;
  left_on: string | null;
  role: string | null;
  is_current: boolean;
};

export type Activity = {
  id: number;
  name: string;
  kind: string;
  description: string | null;
  in_charge_user_id: number | null;
  in_charge_name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  capacity: number | null;
  is_active: boolean;
  members: number;
  places_left: number | null;
  is_full: boolean;
  roster?: RosterRow[];
};

export type StaffRow = { id: number; user_id: number; full_name: string; role: string; is_active: boolean };

export type StudentHit = { id: number; full_name: string; admission_no: string };
