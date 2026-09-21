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
