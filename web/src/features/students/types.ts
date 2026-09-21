// Shapes returned by /api/v1/school/* for the Students module.

export type AcademicYear = { id: number; name: string; start_date: string; end_date: string; is_current: boolean; is_archived: boolean };

export type Section = { id: number; class_id: number; name: string; capacity: number; class_teacher_user_id: number | null };

export type SchoolClass = { id: number; name: string; display_order: number; academic_year_id: number; sections: Section[] };

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
