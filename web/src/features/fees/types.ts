// Shapes returned by the backend for the Fees & Finance module. Money comes
// back as decimal strings from most endpoints and as numbers from a few
// (dashboard, ledger, report); both go through money() as they are.

export type Amount = string | number;

export type MoneyMode = "cash" | "bank_transfer" | "upi" | "card" | "cheque" | "online" | "other";

export type FeeHead = {
  id: number;
  name: string;
  code: string;
  is_recurring: boolean;
  late_fee_type: "none" | "percent" | "fixed";
  late_fee_value: string;
  late_fee_after_days: number;
  is_active: boolean;
  created_at: string;
};

export type FeeStructure = {
  id: number;
  academic_year_id: number;
  class_id: number;
  fee_head_id: number;
  fee_head_name: string;
  fee_head_code: string;
  amount: string;
  due_day_of_month: number;
  is_recurring: boolean;
};

export type StudentFee = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_head_id: number;
  fee_head_name: string;
  fee_head_code: string;
  period: string;
  amount_due: string;
  amount_paid: string;
  amount_outstanding: string;
  due_date: string;
  status: "pending" | "paid" | "waived";
  is_overdue: boolean;
  paid_at: string | null;
  payment_ref: string | null;
  payment_mode: string | null;
  notes: string | null;
};

export type FinanceDashboard = {
  collected_today: number;
  collected_this_month: number;
  raised_this_month: number;
  collection_rate: number;
  outstanding: number;
  students_owing: number;
  buckets: { label: string; amount: number }[];
  top_defaulters: Defaulter[];
  by_month: { month: string; amount: number }[];
};

export type Defaulter = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  owed: Amount;
  items: number;
  oldest_days: number;
};

export type DuesAgeing = {
  as_of: string;
  total: string;
  students_owing: number;
  buckets: { label: string; amount: string }[];
  defaulters: Defaulter[];
};

export type ReminderLog = {
  id: number;
  student_fee_id: number;
  student_name: string;
  student_admission_no: string;
  kind: string;
  send_date: string;
  sent_at: string | null;
  notice_id: number | null;
};

export type Collection = {
  id: number;
  receipt_no: string;
  collected_on: string;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_head_name: string;
  period: string;
  amount: string;
  mode: MoneyMode;
  reference: string | null;
  collected_by_name: string | null;
};

export type LedgerEntry = {
  on: string;
  kind: "charge" | "receipt" | "waiver" | string;
  detail: string;
  reference: string | null;
  charged: number;
  paid: number;
  fee_id: number | null;
  status: string | null;
  note: string | null;
  balance: number;
};

export type Ledger = {
  student_id: number;
  student_name: string;
  admission_no: string;
  class_name: string | null;
  section_name: string | null;
  total_charged: number;
  total_paid: number;
  total_waived: number;
  balance: number;
  entries: LedgerEntry[];
};

export type Assignment = {
  id: number;
  student_id: number;
  student_name: string | null;
  admission_no: string | null;
  fee_head_id: number;
  fee_head_name: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  amount: string;
  class_amount: string | null;
  difference: string | null;
  is_extra: boolean;
  period: string | null;
  due_day_of_month: number;
  reason: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  approved_by: string | null;
};

export type Concession = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_head_id: number | null;
  fee_head_name: string | null;
  kind: "percent" | "fixed";
  value: string;
  reason: string;
  valid_from: string;
  valid_to: string | null;
  approved_by_name: string | null;
  notes: string | null;
  is_active: boolean;
  applied_to_pending: number;
};

export type LateFeeRule = {
  id: number;
  name: string;
  fee_head_id: number | null;
  fee_head_name: string | null;
  charge_head_id: number;
  charge_head_name: string;
  basis: "per_day" | "once" | "percent_per_month";
  amount: string;
  grace_days: number;
  max_amount: string | null;
  is_active: boolean;
};

export type LateFeePreview = {
  date: string;
  rules: number;
  total: string;
  rows: {
    student_fee_id: number;
    student_id: number;
    student_name: string;
    period: string;
    head_name: string;
    due_date: string;
    days_late: number;
    outstanding: string;
    rule_name: string;
    charge: string;
    already_charged: string;
    delta: string;
  }[];
};

export type Refund = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  student_fee_id: number | null;
  fee_label: string | null;
  amount: string;
  reason: string;
  mode: MoneyMode;
  status: "requested" | "approved" | "rejected" | "processed";
  requested_by_name: string | null;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  processed_on: string | null;
  processed_by_name: string | null;
  reference: string | null;
};

export type RefundOption = { student_fee_id: number; label: string; paid: string; refundable: string; receipt_no: string | null };

export type Expense = {
  id: number;
  spent_on: string;
  category_id: number;
  category_name: string;
  supplier_id: number | null;
  payee_name: string | null;
  amount: string;
  tax_amount: string;
  mode: MoneyMode;
  reference: string | null;
  description: string;
  recorded_by_name: string | null;
  is_void: boolean;
  void_reason: string | null;
  created_at: string;
};

export type ExpenseCategory = { id: number; name: string; is_active: boolean };

export type Income = {
  id: number;
  receipt_no: string;
  received_on: string;
  source: "donation" | "rent" | "grant" | "interest" | "sponsorship" | "other";
  payer: string;
  amount: string;
  mode: MoneyMode;
  reference: string | null;
  notes: string | null;
  is_void: boolean;
};

export type CashBook = {
  from_date: string;
  to_date: string;
  income: { fees: Record<string, string>; fees_by_head: Record<string, string>; other: Record<string, string>; store: Record<string, string> };
  expenses: { by_category: Record<string, string>; payroll: string; refunds: string; vendors?: string };
  total_in: string;
  total_out: string;
  net: string;
  by_mode: Record<string, { in: string; out: string }>;
  daily: { date: string; in: string; out: string }[];
};

export type FinanceReport = {
  from_date: string;
  to_date: string;
  received: number;
  receipts: number;
  spent: number;
  net: number;
  income_by_head: { label: string; amount: number }[];
  income_by_mode: { label: string; amount: number }[];
  spend_by_category: { label: string; amount: number }[];
  by_month: { month: string; received: number; spent: number; net: number }[];
  /** per fee head: bills falling due in the window against what has been paid on them */
  billed_by_head: { label: string; expected: number; paid: number; outstanding: number; collection_rate: number; bills: number; receipts: number }[];
};

export type Supplier = {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  is_active: boolean;
};

export type Payables = {
  suppliers: {
    supplier_id: number;
    supplier_name: string;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    is_active: boolean;
    bills: number;
    billed: string;
    paid: string;
    outstanding: string;
    overdue: string;
    unpaid_bills: number;
  }[];
  total_outstanding: Amount;
  total_overdue: Amount;
  suppliers_owed: number;
};

export type PurchaseOrder = {
  id: number;
  supplier_id: number;
  supplier_name: string | null;
  order_no: string;
  ordered_on: string;
  expected_on: string | null;
  status: string;
  notes: string | null;
  total: string;
  billed: string;
  unbilled: string;
};

export type Bill = {
  id: number;
  supplier_id: number;
  supplier_name: string | null;
  order_id: number | null;
  bill_no: string;
  billed_on: string;
  due_on: string | null;
  amount: string;
  tax_amount: string;
  total: string;
  paid: string;
  outstanding: string;
  status: string;
  notes: string | null;
};

/** Parent portal: one child of the signed-in parent. */
export type Child = {
  id: number;
  full_name: string;
  admission_no: string;
  roll_no: number | null;
  section_id: number;
  section_label: string | null;
  fees_pending_amount: number | null;
  relation: string | null;
};

export type Checkout = {
  order_id: number;
  provider: "razorpay" | "mock" | string;
  provider_order_id: string;
  key_id: string | null;
  amount: string;
  amount_paise: number;
  currency: string;
  school_name: string;
  description: string;
  prefill_name: string | null;
  prefill_email: string | null;
  prefill_contact: string | null;
};

export type OnlineOrder = {
  id: number;
  student_id: number;
  student_name: string;
  parent_name: string | null;
  amount: string;
  currency: string;
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  status: "created" | "paid" | "failed";
  receipt_no: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  excess_amount: string;
  created_at: string;
  items: { student_fee_id: number; fee_head_name: string; period: string; amount: string; applied_amount: string }[];
};

export type PickedStudent = { id: number; full_name: string; admission_no: string; section_label: string | null };

/** A purchase-order line, as GET /finance/orders returns it. */
export type OrderLine = {
  id: number;
  item_id: number | null;
  description: string;
  qty: Amount;
  unit_cost: Amount;
  line_total: Amount;
  received_qty: Amount;
  outstanding_qty: Amount;
};

export type PurchaseOrderFull = PurchaseOrder & { lines: OrderLine[] };

export type GenerateResult = { created: number; skipped: number; period: string };
export type TransportFeeResult = { period: string; created: number; skipped: number; total_amount: string };

export type Gateway = {
  configured: boolean;
  provider: string;
  key_id: string | null;
  mode: string | null;
  has_webhook_secret: boolean;
  is_enabled: boolean;
  webhook_url_path: string;
  test_mode_available: boolean;
};

export type ReconRow = {
  order_id: number;
  provider_order_id: string;
  provider_payment_id: string | null;
  student_id: number;
  student_name: string | null;
  amount: string;
  applied: string;
  difference: string;
  excess: string | null;
  paid_at: string | null;
  receipt_no: string | null;
};

export type Reconciliation = {
  from_date: string;
  to_date: string;
  orders: number;
  settled: number;
  settled_amount: string;
  abandoned: number;
  failed: number;
  unapplied: ReconRow[];
  unapplied_amount: string;
  excess: ReconRow[];
  excess_amount: string;
  clean: boolean;
};

export type ChequeStatus = "received" | "deposited" | "cleared" | "bounced" | "returned";

export type Cheque = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_ids: number[];
  fees_label: string;
  amount: string;
  cheque_no: string;
  bank_name: string;
  drawer_name: string | null;
  cheque_date: string;
  received_on: string;
  status: ChequeStatus;
  deposited_on: string | null;
  cleared_on: string | null;
  bounce_reason: string | null;
  due_for_deposit: boolean;
};

/** An inventory item (GET /school/inventory/items). */
export type InventoryItem = {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  unit: string;
  is_sellable: boolean;
  sale_price: string | null;
  is_active: boolean;
  on_hand: string;
  low_stock: boolean;
};
