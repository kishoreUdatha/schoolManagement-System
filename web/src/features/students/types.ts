// Shapes returned by /api/v1/school/* for the Students module.

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

export type Student = {
  id: number;
  admission_no: string;
  full_name: string;
  dob: string | null;
  gender: "male" | "female" | "other" | null;
  blood_group: string | null;
  photo_url: string | null;
  address: string | null;
  academic_year_id: number;
  section_id: number;
  roll_no: number | null;
  is_active: boolean;
  created_at: string;
};

export type ParentContact = { user_id: number; full_name: string; email: string | null; phone: string | null; relation: string | null };

export type StudentProfile = Omit<Student, "created_at"> & {
  section_name: string | null;
  class_id: number;
  class_name: string | null;
  academic_year_name: string | null;
  parents: ParentContact[];
  attendance: { days_present: number; days_absent: number; days_late: number; days_half_day: number; days_marked: number; attendance_percent: number | null };
  behaviour_recent: { id: number; title?: string; kind?: string; category?: string; occurred_on?: string; created_at?: string }[];
  exams: { exam_id?: number; exam_name?: string; percentage?: number | null; grade?: string | null }[];
  homework_recent: { id: number; title: string; subject_name: string | null; subject_code: string | null; due_date: string | null; is_past_due: boolean }[];
  fees_pending_amount: number | null;
};

export type Guardian = {
  guardian_id: number;
  link_id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  address: string | null;
  relation: string;
  is_primary: boolean;
  can_pickup: boolean;
  is_emergency_contact: boolean;
  lives_with_student: boolean;
  has_portal_login: boolean;
};

/* ---------- Bulk import, logins, enrolment history (NEW-010 … NEW-012) ---------- */

export type Gender = "male" | "female" | "other";

/** One row of POST /students/bulk. Every field is optional to the schema; the server checks names per row. */
export type BulkRow = {
  full_name: string | null;
  dob: string | null;
  gender: Gender | null;
  blood_group: string | null;
  address: string | null;
  photo_url: string | null;
};

/** `row` is the index into the `students` array that was sent. */
export type BulkError = { row: number; full_name?: string | null; error: string };

export type BulkResult = { created: Student[]; errors: BulkError[] };

/** GET /student-logins */
export type LoginStatusRow = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  has_login: boolean;
  is_active: boolean;
  last_login_at: string | null;
};

/** A password, returned once by POST /student-logins/… */
export type LoginCreated = { student_id: number; admission_no: string; student_name: string; user_id: number; password: string; created: boolean };

export type ClassLoginsCreated = { class_id: number; created: LoginCreated[]; reset: LoginCreated[]; total: number };

export type Outcome = "studying" | "promoted" | "repeated" | "left";
export const OUTCOMES: Outcome[] = ["studying", "promoted", "repeated", "left"];

/** GET /students/{id}/enrollments */
export type Enrollment = {
  id: number;
  academic_year_id: number;
  academic_year_name: string;
  section_id: number;
  section_label: string | null;
  roll_no: number;
  start_date: string;
  end_date: string | null;
  outcome: Outcome;
  notes: string | null;
};

/** GET /enrollments?academic_year_id&section_id */
export type RosterRow = {
  student_id: number;
  full_name: string;
  admission_no: string;
  section_label: string | null;
  roll_no: number;
  outcome: Outcome;
  start_date: string;
  end_date: string | null;
};

export const RELATIONS = ["father", "mother", "guardian", "grandparent", "uncle", "aunt", "sibling", "driver", "other"] as const;
export type Relation = (typeof RELATIONS)[number];

/** POST /students/{id}/guardians/{gid}/portal-access, shown once. */
export type PortalGrant = { user_id: number; email: string; temporary_password: string };

/** GET /school/profile, the part a login slip needs. */
export type SchoolCode = { name: string; code: string };

/** Page-head buttons announce themselves with these window events (PageAction / usePageAction). */
export const EV = {
  classLogins: "students:class-logins",
} as const;
