// Shapes returned by the Settings / Roles / Permissions / Audit endpoints (/api/v1/school/*).

export type BaseRole = "super_admin" | "school_admin" | "teacher" | "parent" | "staff" | "student" | "principal" | "accountant";

/** GET /permissions: the backend's catalogue. Nothing else is a permission. */
export type Permission = { code: string; module: string; name: string; description: string | null };

/** GET /roles */
export type Role = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  base_role: BaseRole;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
  users: number;
};

/** GET /role-assignments */
export type Assignment = {
  id: number;
  user_id: number;
  user_name: string;
  role_id: number;
  role_name: string;
  branch_id: number | null;
  branch_name: string | null;
  assigned_at: string;
};

export type Branch = { id: number; name: string; code: string; is_main: boolean; is_active: boolean };

/** GET /staff: every staff login. */
export type StaffUser = {
  id: number;
  user_id: number;
  employee_no: string;
  designation: string | null;
  department_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
};

/** GET /settings: the settings index with set-up state. */
export type SettingEntry = { key: string; module: string; name: string; description: string; read: string; write: string | null; configured: boolean };

/** GET /integrations */
export type Integration = { key: string; name: string; purpose: string; read: string | null; write: string | null; enabled: boolean; configured: boolean; detail: string | null };

export type TwoFactorScope = "nobody" | "parents" | "staff" | "everybody";

/** GET/PUT /settings/security */
export type SecurityPolicy = {
  min_password_length: number;
  require_mixed_case: boolean;
  require_number: boolean;
  require_symbol: boolean;
  password_expiry_days: number | null;
  max_failed_attempts: number | null;
  lockout_minutes: number | null;
  session_timeout_minutes: number | null;
  require_2fa_for: TwoFactorScope;
  rules: string[];
};

/** GET /settings/notifications/categories */
export type NotificationCatalogue = { channels: string[]; categories: string[]; locked_categories: string[]; locked_channels: string[] };

export type NotificationTemplate = {
  id: number;
  code: string;
  name: string;
  channel: "in_app" | "email" | "sms" | "whatsapp";
  category: string;
  subject: string | null;
  body: string;
  description: string | null;
  is_active: boolean;
};

export type TemplatePreview = { subject: string | null; body: string; unfilled: string[] };

export type AuditEntry = {
  id: number;
  action: "create" | "update" | "delete";
  entity_type: string;
  entity_id: number | null;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  request_path: string | null;
  result: "success" | "failed";
  scope: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

export type GradeBand = { grade: string; min_percent: string; max_percent: string; is_pass?: boolean };
export type GradeScale = { id: number; name: string; description: string | null; is_default: boolean; is_active: boolean; used_by_exams: number; bands: GradeBand[] };

export type ReportCardSettings = {
  id: number;
  show_attendance: boolean;
  show_rank: boolean;
  show_grade_scale: boolean;
  show_remarks: boolean;
  require_result_approval: boolean;
  principal_name: string | null;
  footer_note: string | null;
};

export type ImportType = "students" | "staff" | "marks";
export type ImportJob = {
  id: number;
  import_type: ImportType;
  status: "uploaded" | "checked" | "imported" | "failed" | "cancelled";
  file_name: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  errors: { row: number | null; value: string | null; error: string | null }[];
  message: string | null;
  created_by_name: string | null;
  created_at: string;
};
