// Shapes returned by /api/v1/school/parents and friends, for the Parents & Guardians module.

export type ParentRelation = "father" | "mother" | "guardian" | "other";

export const RELATIONS: ParentRelation[] = ["father", "mother", "guardian", "other"];

export type ChildLink = {
  student_id: number;
  full_name: string;
  admission_no: string;
  section_id: number;
  section_label: string | null;
  relation: ParentRelation;
  /** This parent is the child's primary contact. */
  is_primary_contact: boolean;
};

/** ParentRead: one parent login and the children it can see. */
export type Parent = {
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  /** Kept on the guardian record that mirrors this login. */
  occupation: string | null;
  address: string | null;
  children: ChildLink[];
};

/** GET /api/v1/school/parents/{id}/notes: office notes the parent never sees. */
export type ParentNote = {
  id: number;
  parent_user_id: number;
  body: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type ParentCreateResponse = { parent: Parent; temporary_password: string };
export type PasswordReset = { user_id: number; temporary_password: string };

/** One row of GET /api/v1/school/audit-log. */
export type AuditEntry = {
  id: number;
  action: "create" | "update" | "delete";
  entity_type: string;
  entity_id: number | null;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  request_path: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

/** StudentFeeRead, from GET /api/v1/school/fees/student-fees. */
export type StudentFee = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_head_name: string;
  period: string;
  amount_due: string;
  amount_paid: string;
  amount_outstanding: string;
  due_date: string;
  status: "pending" | "paid" | "waived";
  is_overdue: boolean;
};

/** A receipt, from GET /api/v1/school/accounts/collections. */
export type Receipt = {
  id: number;
  receipt_no: string;
  collected_on: string;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_head_name: string;
  period: string;
  amount: string;
  mode: string;
  reference: string | null;
  collected_by_name: string | null;
};

/** GET /api/v1/parent/me/preferences. */
export type PreferenceRow = { channel: string; category: string; is_enabled: boolean; locked: boolean; locked_because: string | null };
export type Preferences = { user_id: number; rows: PreferenceRow[]; locked_categories: string[]; locked_channels: string[] };

/** GET /api/v1/school/ptm and /ptm/{id}. */
export type PtmSession = {
  id: number;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  venue: string | null;
  scope_label: string;
  is_published: boolean;
  teacher_count?: number;
  slot_count?: number;
  booked_count?: number;
};

export type PtmSlot = {
  id: number;
  start_time: string;
  end_time: string;
  status: "open" | "booked" | "done" | "no_show";
  student_id: number | null;
  student_name: string | null;
  class_label: string | null;
  parent_name: string | null;
  parent_note: string | null;
  teacher_notes: string | null;
};

export type PtmSessionDetail = PtmSession & { teachers: { teacher_user_id: number; teacher_name: string; slots: PtmSlot[] }[] };

/** GET /api/v1/school/guardians: one family contact, login or not. */
export type GuardianRow = {
  guardian_id: number;
  user_id: number | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  has_portal_login: boolean;
  is_active: boolean | null;
  last_login_at: string | null;
  children: {
    student_id: number;
    full_name: string;
    admission_no: string;
    section_label: string | null;
    relation: string;
    is_primary: boolean;
  }[];
};
