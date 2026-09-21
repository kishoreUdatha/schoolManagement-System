// Shapes of the /api/v1/super-admin responses these screens read.

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

export type SchoolRow = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  address: string | null;
  timezone: string | null;
  currency: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
};

export type Subscription = {
  id: number;
  tenant_id: number;
  plan_id: number;
  billing_cycle: "monthly" | "yearly";
  status: "pending" | "active" | "expired" | "cancelled";
  started_at: string | null;
  expires_at: string | null;
  razorpay_subscription_id?: string | null;
  notes: string | null;
  created_at: string;
};

export type TenantDetail = Tenant & { schools: SchoolRow[]; current_subscription: Subscription | null };

export type Payment = {
  id: number;
  subscription_id: number | null;
  tenant_id: number;
  amount: string;
  currency: string;
  mode: "razorpay" | "manual";
  status: "pending" | "success" | "failed" | "refunded";
  paid_at: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type Meter = { used: number; limit: number | null; percent: number | null; unlimited?: boolean };

export type TenantUsage = {
  tenant_id: number;
  students: Meter;
  staff: Meter;
  parents: number;
  active_users: number;
  storage_mb: Meter;
  sms_sent: Meter;
  whatsapp_sent: Meter;
  email_sent: Meter;
  payment_status: string | null;
  subscription_expires_at: string | null;
};

export type UsageRow = {
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  tenant_status: TenantStatus;
  students: Meter;
  staff: Meter;
  storage_mb: Meter;
  sms: Meter;
  whatsapp: Meter;
  email: Meter;
  parents: number;
  active_users: number;
  over: string[];
  near: string[];
  no_limits_set: boolean;
};

export type UsageOverview = { tenants: UsageRow[] } & Record<string, unknown>;

export type UsageSummary = {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_schools: number;
  total_students: number;
  total_staff: number;
  total_parents: number;
  sms_sent_30d: number;
  whatsapp_sent_30d: number;
  email_sent_30d: number;
  storage_used_mb: number;
  revenue_30d: number;
  pending_renewals: number;
};

export type Renewal = {
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  days_remaining: number | null;
  expires_at: string | null;
  contact_email: string;
};

export type BillingRow = {
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  tenant_status: TenantStatus;
  plan_name: string | null;
  billing_cycle: string | null;
  subscription_status: string | null;
  price: number | null;
  started_at: string | null;
  expires_at: string | null;
  days_to_expiry: number | null;
  expiring_soon: boolean;
  expired: boolean;
  total_paid: number;
  last_payment_at: string | null;
  last_payment_status: string | null;
};

export type Billing = {
  tenants: BillingRow[];
  total_tenants: number;
  on_a_plan: number;
  without_a_plan: number;
  expiring_soon: number;
  expired: number;
  revenue_30d: number;
  failed_payments_30d: number;
  billed_monthly: number;
  invoicing_modelled: boolean;
};

export type PlanModule = { module_key: string; enabled: boolean };

export type Plan = {
  id: number;
  name: string;
  tier: "basic" | "standard" | "premium" | null;
  description: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  student_limit: number | null;
  staff_limit: number | null;
  storage_mb_limit: number | null;
  sms_quota: number | null;
  whatsapp_quota: number | null;
  email_quota: number | null;
  is_active: boolean;
  created_at: string;
  modules: PlanModule[];
};

export type HealthCheck = { name: string; state: string; detail: string; monitored: boolean };

export type Health = {
  checked_at: string;
  checks: HealthCheck[];
  all_monitored_up: boolean;
  unmonitored: number;
  tenants_active: number;
  users_active: number;
  usage_rows_today: number;
  open_tickets: number;
};

export type TicketReply = { id: number; author: string | null; body: string; is_internal: boolean; created_at: string };

export type Ticket = {
  id: number;
  tenant_id: number | null;
  tenant_name: string | null;
  raised_by: string | null;
  subject: string;
  body: string;
  status: "open" | "waiting" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  replies: TicketReply[];
  reply_count: number;
};

export type TicketList = {
  tickets: Ticket[];
  open: number;
  waiting: number;
  resolved: number;
  closed: number;
  urgent_open: number;
};
