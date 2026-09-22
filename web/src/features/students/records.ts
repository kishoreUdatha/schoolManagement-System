// Shapes of the per-student records behind SCR-059..070 (school admin portal).

export type Academic = {
  student_id: number;
  subjects: { class_subject_id: number; subject_name: string; subject_code: string | null; kind: string | null; teacher_name: string | null }[];
  history: { enrollment_id: number; academic_year_name: string | null; class_name: string | null; section_name: string | null; roll_no: number | null; outcome: string | null }[];
};

export type ExamPaper = {
  subject_name: string;
  subject_code: string | null;
  max_marks: number;
  pass_marks: number;
  marks_obtained: number | null;
  grade: string | null;
  status: string | null;
  is_pass: boolean | null;
};

export type ExamHistory = {
  student_id: number;
  exams: { exam_id: number; exam_name: string; kind: string; start_date: string; subjects: ExamPaper[]; obtained: number; out_of: number; percent: number; marked: number }[];
};

export type RemarkRow = {
  student_id: number;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
  teacher_remark: string | null;
  principal_remark: string | null;
};

export type AttendanceReport = {
  student_id: number;
  section_label: string | null;
  marked_days: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  percent: number | null;
  months: { month: string; present: number; absent: number; late: number; half_day: number; percent: number | null }[];
  days: { date: string; status: string; remark: string | null; session: string | null; arrived_at: string | null; left_at: string | null }[];
};

export type Ledger = {
  student_id: number;
  total_charged: number;
  total_paid: number;
  total_waived: number;
  balance: number;
  entries: { on: string; kind: string; detail: string; reference: string | null; charged: number; paid: number; fee_id: number | null; status: string | null; note: string | null; balance: number }[];
};

export type Doc = {
  id: number;
  category: string;
  title: string;
  content_type: string | null;
  size_bytes: number | null;
  original_name: string | null;
  expires_on: string | null;
  uploaded_by_name: string | null;
  verification_status: "pending" | "verified" | "rejected";
  verified_by_name: string | null;
  verified_at: string | null;
  remarks: string | null;
  created_at: string;
};

export const DOC_CATEGORIES = [
  "birth_certificate",
  "aadhaar",
  "photo",
  "address_proof",
  "transfer_certificate",
  "previous_marksheet",
  "medical",
  "caste_certificate",
  "id_proof",
  "other",
];

export type Incident = {
  id: number;
  reference_no: string;
  occurred_on: string;
  place: string | null;
  category: string;
  severity: string;
  description: string;
  witnesses: string | null;
  status: string;
  reported_by_name: string | null;
  resolution: string | null;
  closed_on: string | null;
  closed_by_name: string | null;
  shared_with_parents: boolean;
  parent_informed_at: string | null;
  actions: { id: number; kind: string; details: string | null; start_date: string | null; end_date: string | null; assigned_by_name: string | null; completed_on: string | null }[];
};

export const INCIDENT_CATEGORIES = ["bullying", "fighting", "cheating", "disrespect", "property_damage", "phone_misuse", "uniform", "late_or_absent", "unsafe_behaviour", "other"];

export type HealthProfile = Record<
  | "allergies"
  | "chronic_conditions"
  | "current_medications"
  | "dietary_restrictions"
  | "disabilities"
  | "doctor_name"
  | "doctor_phone"
  | "emergency_contact_name"
  | "emergency_contact_phone"
  | "emergency_contact_relation"
  | "insurance_provider"
  | "insurance_policy_no"
  | "notes",
  string | null
> & { blood_group: string | null; updated_at: string | null; updated_by_name: string | null };

export type HealthRecord = {
  student_id: number;
  student_name: string;
  section_label: string | null;
  profile: HealthProfile;
  checkups: { id: number; checked_on: string; height_cm: string | null; weight_kg: string | null; bmi: string | null; notes: string | null }[];
  visits: { id: number; visited_at: string; complaint: string; treatment: string | null; medicine_given: string | null; outcome: string; follow_up_on: string | null; parent_notified: boolean; recorded_by_name: string | null }[];
  immunizations: { id: number; vaccine: string; dose: string | null; given_on: string | null; next_due_on: string | null; notes: string | null }[];
};

export type TransportAssignment = {
  id: number;
  student_id: number;
  route_id: number;
  route_name: string;
  stop_id: number;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: string;
  monthly_fee: string | null;
  start_date: string;
  end_date: string | null;
};

export type TransportRoute = {
  id: number;
  name: string;
  code: string | null;
  vehicle_id: number | null;
  vehicle_label: string | null;
  student_count: number;
  stops: { id: number; name: string; sequence: number; pickup_time: string | null; drop_time: string | null; student_count: number }[];
};

export type Vehicle = { id: number; registration_no: string; label: string | null; driver_name: string | null; driver_phone: string | null; conductor_name: string | null };

export type Trip = { id: number; route_id: number; trip_date: string; direction: string; status: string; driver_name: string | null; expected: number; boarded: number; absent: number };

export type Loan = {
  id: number;
  accession_no: string;
  title: string;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  lost_on: string | null;
  renew_count: number;
  overdue_days: number;
  fine_amount: string;
  accruing_fine: string;
  fine_status: string;
};

export type Family = {
  student_id: number;
  parents: { user_id: number; full_name: string; email: string | null; phone: string | null; relation: string | null; is_active: boolean }[];
  siblings: { student_id: number; admission_no: string; full_name: string; roll_no: number | null; class_name: string | null; section_name: string | null; is_active: boolean; shared_parents: string[] }[];
};

export type Leaver = {
  student_id: number;
  admission_no: string;
  full_name: string;
  last_year_name: string | null;
  last_class_name: string | null;
  last_section_name: string | null;
  outcome: string | null;
  certificate_id: number | null;
  certificate_no: string | null;
  certificate_status: string | null;
};

export type StaffMember = { id: number; user_id: number; full_name: string };
