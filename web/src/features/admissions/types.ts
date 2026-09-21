// Shapes returned by /api/v1/school/admissions/* (enquiries and applications).

export type AdmissionStage = "enquiry" | "contacted" | "visit_scheduled" | "visited" | "applied" | "test_scheduled" | "offered" | "enrolled" | "lost";

export type AdmissionSource = "walk_in" | "website" | "phone" | "referral" | "social_media" | "advertisement" | "campaign" | "other";

export type ActivityKind = "note" | "call" | "visit" | "email" | "whatsapp" | "stage_change";

export const STAGES: AdmissionStage[] = ["enquiry", "contacted", "visit_scheduled", "visited", "applied", "test_scheduled", "offered", "enrolled", "lost"];

export const SOURCES: AdmissionSource[] = ["walk_in", "website", "phone", "referral", "social_media", "advertisement", "campaign", "other"];

export type Enquiry = {
  id: number;
  student_name: string;
  dob: string | null;
  gender: "male" | "female" | "other" | null;
  applying_for_class: string | null;
  previous_school: string | null;
  parent_name: string;
  parent_phone: string;
  parent_email: string | null;
  address: string | null;
  source: AdmissionSource;
  campaign_id: number | null;
  campaign_name: string | null;
  stage: AdmissionStage;
  assigned_to_user_id: number | null;
  assigned_to_name: string | null;
  next_follow_up_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  student_id: number | null;
  converted_at: string | null;
  created_at: string;
};

export type Activity = {
  id: number;
  kind: ActivityKind;
  note: string | null;
  from_stage: AdmissionStage | null;
  to_stage: AdmissionStage | null;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
};

export type EnquiryDetail = Enquiry & { activities?: Activity[] };

export type AdmissionStats = {
  total: number;
  by_stage: Record<AdmissionStage, number>;
  by_source: Record<string, number>;
  enrolled: number;
  lost: number;
  open: number;
  conversion_rate: number;
  follow_ups_due: number;
};

export type ApplicationStatus = "draft" | "submitted" | "verification" | "assessment" | "approved" | "fee_pending" | "admitted" | "rejected" | "withdrawn";

export const APPLICATION_STATUSES: ApplicationStatus[] = ["draft", "submitted", "verification", "assessment", "approved", "fee_pending", "admitted", "rejected", "withdrawn"];

export const DOC_KINDS = ["birth_certificate", "aadhaar", "photo", "address_proof", "transfer_certificate", "previous_marksheet", "medical", "caste_certificate", "other"];

export type AppDocument = {
  id: number;
  category: string;
  file_name: string;
  size_bytes: number;
  is_verified: boolean;
  remark: string | null;
  verified_at: string | null;
};

export type AssessmentKind = "written_test" | "interaction" | "interview" | "audition" | "other";

export type Assessment = {
  id: number;
  kind: AssessmentKind;
  scheduled_at: string;
  venue: string | null;
  assessor_user_id: number | null;
  assessor_name: string | null;
  max_marks: string | null;
  marks_obtained: string | null;
  status: "scheduled" | "done" | "absent" | "cancelled";
  passed: boolean | null;
  remarks: string | null;
};

export type HistoryRow = { from_status: ApplicationStatus | null; to_status: ApplicationStatus; note: string | null; changed_by_name: string | null; changed_at: string };

export type Application = {
  id: number;
  application_no: string;
  enquiry_id: number | null;
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_id: number | null;
  class_name: string | null;
  applying_for_class: string | null;
  student_name: string;
  dob: string | null;
  gender: "male" | "female" | "other" | null;
  previous_school: string | null;
  sibling_in_school: boolean;
  category: string | null;
  father_name: string | null;
  mother_name: string | null;
  guardian_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  application_fee: string | null;
  fee_paid_on: string | null;
  fee_receipt_no: string | null;
  student_id: number | null;
  documents_total: number;
  documents_verified: number;
  documents?: AppDocument[];
  assessments?: Assessment[];
  history?: HistoryRow[];
};

export type Funnel = { by_status: Partial<Record<ApplicationStatus, number>>; total: number; in_progress: number; admitted: number };

/** GET /api/v1/school/directory/staff — who can be a counsellor or assessor. */
export type StaffOption = { user_id: number; full_name: string; role: string };
