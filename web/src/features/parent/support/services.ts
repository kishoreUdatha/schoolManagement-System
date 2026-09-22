/*
 * Parent services API (GET/POST /api/v1/parent/me/…): requests the school
 * approves, the office help desk, feedback surveys and the school's contact
 * hours. Shared by the parent screens that use them.
 */

export const ME = "/api/v1/parent/me";

export type RequestKind = "link_child" | "contact_change" | "transport_change" | "library_renewal";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

/** A request to the school (GET /parent/me/requests). */
export type ParentRequest = {
  id: number;
  kind: RequestKind;
  status: RequestStatus;
  student_id: number | null;
  student_name: string | null;
  details: Record<string, string | number | null>;
  summary: string;
  reason: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export const REQUEST_STATUS: Record<RequestStatus, [text: string, cls: string]> = {
  pending: ["Pending school review", "value warning"],
  approved: ["Approved", "value good"],
  rejected: ["Declined", "value bad"],
  cancelled: ["Withdrawn", "value"],
};

/** The school's communication hours and office desk (GET /parent/me/school-contact). */
export type SchoolContact = {
  school_name: string | null;
  communication_hours: string | null;
  office_hours: string | null;
  office_phone: string | null;
  office_email: string | null;
  help_desk_note: string | null;
};

export type TicketStatus = "open" | "in_progress" | "resolved";

/** A request to the school office help desk (GET /parent/me/help-tickets). */
export type Ticket = {
  id: number;
  student_id: number | null;
  student_name: string | null;
  category: string;
  subject: string;
  status: TicketStatus;
  assigned_to_name: string | null;
  last_activity_at: string | null;
  parent_unread: number;
  last_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  replies: { id: number; author_name: string | null; from_parent: boolean; body: string; created_at: string }[] | null;
};

export const TICKET_STATUS: Record<TicketStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

export type SurveyQuestion = { id: string; text: string; kind: "rating" | "choice" | "text"; options: string[]; required: boolean };

/** A feedback survey (GET /parent/me/surveys). */
export type Survey = {
  id: number;
  title: string;
  description: string | null;
  audience: "all" | "class";
  class_name: string | null;
  questions: SurveyQuestion[];
  status: "draft" | "open" | "closed";
  closes_on: string | null;
  submitted: boolean | null;
  submitted_at: string | null;
  my_answers: Record<string, string | number> | null;
};
