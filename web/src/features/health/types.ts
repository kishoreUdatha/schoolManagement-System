// Shapes returned by /api/v1/school/health/*, /wellbeing/* and /discipline/*.
// Health and counselling records are shown exactly as the API returns them
// for the signed-in role; nothing here adds or keeps sample content.

export type HealthDashboard = { visits_today: number; sent_home_today: number; referred_today: number; students_with_alerts: number; immunizations_due: number; follow_ups_due: number };

export type VisitOutcome = "back_to_class" | "rested" | "sent_home" | "parent_picked_up" | "referred_hospital";

export type Visit = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  visited_at: string;
  complaint: string;
  temperature_c: string | null;
  treatment: string | null;
  medicine_given: string | null;
  outcome: VisitOutcome;
  follow_up_on: string | null;
  parent_notified: boolean;
  recorded_by_name: string | null;
  allergies: string | null;
};

export type Alert = { student_id: number; student_name: string; section_label: string | null; blood_group: string | null; allergies: string | null; chronic_conditions: string | null; current_medications: string | null; emergency_contact_phone: string | null };

export type ProfileRow = {
  student_id: number;
  admission_no: string;
  student_name: string;
  section_label: string | null;
  blood_group: string | null;
  has_profile: boolean;
  flags: string[];
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  doctor_name: string | null;
  updated_at: string | null;
};

export type Profile = {
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  dietary_restrictions: string | null;
  disabilities: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  insurance_provider: string | null;
  insurance_policy_no: string | null;
  notes: string | null;
  student_id: number;
  blood_group: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

export type Checkup = { id: number; student_id: number; checked_on: string; height_cm: string | null; weight_kg: string | null; vision_left: string | null; vision_right: string | null; dental: string | null; notes: string | null; bmi: string | null };

export type Immunization = { id: number; student_id: number; vaccine: string; dose: string | null; given_on: string | null; next_due_on: string | null; notes: string | null };

export type HealthRecord = { student_id: number; student_name: string; section_label: string | null; profile: Profile; checkups: Checkup[]; visits: Visit[]; immunizations: Immunization[] };

export type Due = { student_id: number; full_name?: string; student_name?: string; admission_no?: string | null; vaccine: string; next_due_on: string | null; section_label?: string | null };

export type Dose = {
  id: number;
  student_id: number;
  student_name?: string | null;
  admission_no?: string | null;
  section_label?: string | null;
  given_on: string;
  given_at: string;
  medicine: string;
  dose: string;
  reason: string | null;
  given_by: string | null;
  given_by_user_id: number | null;
  recorded_by: string | null;
  prescribed_by: string | null;
  consent_reference: string | null;
  parent_informed: boolean;
  notes: string | null;
  corrects_id: number | null;
  correction_reason: string | null;
  is_superseded: boolean;
};

export type FirstAid = {
  id: number;
  student_id: number | null;
  student_name: string | null;
  admission_no: string | null;
  section_label: string | null;
  staff_name: string | null;
  happened_on: string;
  happened_at: string;
  place: string | null;
  what_happened: string;
  treatment: string;
  treated_by: string | null;
  outcome: string;
  sent_home: boolean;
  parent_informed: boolean;
  referred_to: string | null;
};

export type Appointment = {
  id: number;
  case_id: number | null;
  student_id: number;
  student_name?: string | null;
  admission_no?: string | null;
  section_label?: string | null;
  scheduled_on: string;
  scheduled_at: string;
  duration_minutes: number;
  counsellor_user_id: number | null;
  counsellor_name: string | null;
  status: "booked" | "attended" | "missed" | "cancelled";
  notes: string | null;
};

export type CaseSession = { id: number; met_on: string; minutes: number | null; attendees: string | null; notes: string; support_plan: string | null; next_session_on: string | null; recorded_by_name: string | null };

export type CounsellingCase = {
  id: number;
  reference_no: string;
  student_id: number;
  student_name: string;
  section_label: string | null;
  title: string;
  category: string;
  concern: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "referred" | "closed";
  is_sensitive: boolean;
  opened_on: string;
  referred_by_name: string | null;
  counsellor_user_id: number | null;
  counsellor_name: string | null;
  parent_informed: boolean;
  referred_to: string | null;
  outcome: string | null;
  closed_on: string | null;
  session_count: number;
  can_write?: boolean;
  sessions?: CaseSession[];
};

export type IncidentAction = { id: number; kind: string; details: string | null; start_date: string | null; end_date: string | null; assigned_by_name: string | null; completed_on: string | null; counselling_case_id: number | null };

export type IncidentStatus = "reported" | "investigating" | "action_taken" | "closed" | "dismissed";

export type Incident = {
  id: number;
  reference_no: string;
  student_id: number;
  student_name: string;
  admission_no: string | null;
  section_id: number | null;
  section_label: string | null;
  occurred_on: string;
  place: string | null;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  witnesses: string | null;
  status: IncidentStatus;
  reported_by_name: string | null;
  resolution: string | null;
  closed_on: string | null;
  closed_by_name: string | null;
  shared_with_parents: boolean;
  parent_informed_at: string | null;
  can_edit?: boolean;
  is_office?: boolean;
  actions?: IncidentAction[];
};

export type OutstandingAction = {
  id: number;
  incident_id: number;
  reference_no: string | null;
  student_id?: number;
  student_name?: string | null;
  admission_no?: string | null;
  section_label?: string | null;
  kind: string;
  details: string | null;
  start_date: string | null;
  end_date: string | null;
  assigned_by: string | null;
  completed_on: string | null;
  completed_by: string | null;
  is_served: boolean;
  overdue: boolean;
};

export type ChainLink = { id: number; sequence: number; contact_name: string; relationship: string; phone: string; notes: string | null; availability: string | null };

export type Chain = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  chain: ChainLink[];
  profile_contact_name: string | null;
  profile_contact_phone: string | null;
  profile_contact_relation: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
};

export type Thin = { students: { student_id: number; student_name: string; admission_no: string; section_label: string | null; contacts: number; why: string; availability: string | null }[]; count: number; none_at_all: number };

export type StaffOption = { user_id: number; full_name: string; role: string };
