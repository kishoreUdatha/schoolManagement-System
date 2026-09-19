export type AdmissionStage =
  | "enquiry"
  | "contacted"
  | "visit_scheduled"
  | "visited"
  | "applied"
  | "test_scheduled"
  | "offered"
  | "enrolled"
  | "lost";

export type AdmissionSource =
  | "walk_in"
  | "website"
  | "phone"
  | "referral"
  | "social_media"
  | "advertisement"
  | "campaign"
  | "other";

export type ActivityKind = "note" | "call" | "visit" | "email" | "whatsapp" | "stage_change";

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
  user_name: string | null;
  created_at: string;
};

export type EnquiryDetail = Enquiry & { activities: Activity[] };

export type Campaign = {
  id: number;
  name: string;
  channel: AdmissionSource;
  start_date: string | null;
  end_date: string | null;
  budget: string | null;
  description: string | null;
  is_active: boolean;
  enquiry_count: number;
  enrolled_count: number;
};

export const STAGES: AdmissionStage[] = [
  "enquiry",
  "contacted",
  "visit_scheduled",
  "visited",
  "applied",
  "test_scheduled",
  "offered",
  "enrolled",
  "lost",
];

export const SOURCES: AdmissionSource[] = [
  "walk_in",
  "website",
  "phone",
  "referral",
  "social_media",
  "advertisement",
  "campaign",
  "other",
];

export function label(v: string): string {
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function stageTone(s: AdmissionStage) {
  if (s === "enrolled") return "emerald" as const;
  if (s === "lost") return "rose" as const;
  if (s === "offered" || s === "applied" || s === "test_scheduled") return "brand" as const;
  if (s === "enquiry") return "amber" as const;
  return "neutral" as const;
}

export const selectClass =
  "rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink shadow-sm";
