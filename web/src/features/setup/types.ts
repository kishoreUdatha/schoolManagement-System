// Shapes returned by the school-setup endpoints (/api/v1/school/* and /api/v1/super-admin/*).

export type { AcademicYear, SchoolClass, Section } from "@/features/students/types";

export type Term = {
  id: number;
  academic_year_id: number;
  name: string;
  start_date: string;
  end_date: string;
  sequence: number;
  working_days: number | null;
  school_days: number | null;
};

export type AttendanceMode = "daily" | "period" | "daily_period";

/** GET/PATCH /api/v1/school/profile */
export type SchoolProfile = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  logo_url: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  status: "active" | "inactive";
  brand_color: string | null;
  app_name: string | null;
  principal_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  working_days: string;
  school_start_time: string | null;
  school_end_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  board: string | null;
  school_type: string | null;
  website: string | null;
  accent_color: string | null;
  attendance_mode: AttendanceMode;
  promotion_threshold: number | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /api/v1/school/branches (there is no GET for one branch). */
export type Branch = {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  head_user_id: number | null;
  head_name: string | null;
  is_main: boolean;
  is_active: boolean;
  email: string | null;
  capacity: number | null;
  sections: number;
  staff: number;
  students: number;
  section_ids?: number[];
};

export type Department = {
  id: number;
  name: string;
  code: string;
  head_user_id: number | null;
  head_name: string | null;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  staff_count: number;
  subject_count: number;
};

/** GET /api/v1/school/directory/staff */
export type StaffPick = { user_id: number; full_name: string; role: string };

/** GET /api/v1/school/staff */
export type StaffMember = {
  id: number;
  user_id: number;
  employee_no: string;
  designation: string | null;
  department_name: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
};

export type AuditEntry = {
  id: number;
  action: "create" | "update" | "delete";
  entity_type: string;
  entity_id: number | null;
  user_name: string | null;
  created_at: string;
};

// ---- super-admin ----

export type TenantStatus = "active" | "suspended" | "deleted";

export type Tenant = {
  id: number;
  name: string;
  code: string;
  logo_url: string | null;
  address: string | null;
  contact_person: string | null;
  contact_email: string;
  contact_mobile: string;
  status: TenantStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TenantSchool = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  currency: string;
  status: "active" | "inactive";
  is_active: boolean;
  created_at: string;
  board: string | null;
  school_type: string | null;
  branch_count: number;
};

export type Subscription = { id: number; plan_id: number; billing_cycle: "monthly" | "yearly"; status: string; expires_at: string | null };

export type TenantDetail = Tenant & { schools: TenantSchool[]; current_subscription: Subscription | null };

export type Quota = { used: number; limit: number; percent: number };

export type TenantUsage = { tenant_id: number; students: Quota; staff: Quota; parents: number; active_users: number };

export type Plan = { id: number; name: string; tier: string };

export type TenantCreated = {
  tenant: Tenant;
  school: TenantSchool;
  school_admin_user_id: number;
  school_admin_email: string;
  school_admin_temporary_password: string | null;
  // sign-in details sent to the admin's mobile on WhatsApp and SMS
  credentials_sent?: { channel: string; to: string; status: string; error: string | null }[];
};
