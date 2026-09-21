// Shapes returned by /api/v1/school/front-desk/*.

export type Purpose = "meeting" | "parent_visit" | "admission_enquiry" | "delivery" | "vendor" | "interview" | "event" | "maintenance" | "other";

export type VisitStatus = "expected" | "checked_in" | "checked_out" | "denied" | "cancelled";

export type Visit = {
  id: number;
  visitor_name: string;
  phone: string;
  id_type: string | null;
  id_last4: string | null;
  company: string | null;
  purpose: Purpose;
  purpose_detail: string | null;
  host_user_id: number | null;
  host_name: string | null;
  student_id: number | null;
  student_name: string | null;
  people_count: number;
  vehicle_no: string | null;
  status: VisitStatus;
  expected_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  pass_no: string | null;
  minutes_inside: number | null;
  notes: string | null;
  host_approved_at: string | null;
  host_declined_reason: string | null;
};

export type FrontDeskDashboard = { inside_now: number; visitors_today: number; expected_today: number; gate_passes_today: number; gate_passes_pending: number; open_incidents: number };

export type GatePass = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  leave_on: string;
  leave_time: string | null;
  reason: string;
  pickup_name: string;
  pickup_relation: string | null;
  pickup_phone: string | null;
  code: string | null;
  status: "requested" | "approved" | "rejected" | "departed" | "cancelled";
  requested_by_name: string | null;
  requested_by_parent: boolean;
  pickup_listed: boolean | null;
  decision_note: string | null;
  departed_at: string | null;
  created_at: string;
};

export type SecurityIncident = {
  id: number;
  occurred_at: string;
  location: string | null;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  action_taken: string | null;
  is_closed: boolean;
  reported_by_name: string | null;
  created_at: string;
};

export type Host = { user_id: number; full_name: string; role: string };

export const PURPOSES: Record<Purpose, string> = {
  meeting: "Meeting",
  parent_visit: "Parent visit",
  admission_enquiry: "Admission enquiry",
  delivery: "Delivery",
  vendor: "Vendor",
  interview: "Interview",
  event: "Event",
  maintenance: "Maintenance",
  other: "Other",
};

export const VISIT_STATUS: Record<VisitStatus, string> = { expected: "Expected", checked_in: "Inside", checked_out: "Checked out", denied: "Denied", cancelled: "Cancelled" };
