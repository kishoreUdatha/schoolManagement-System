// Shapes returned by /api/v1/school/books/* (backend: services/books_service.py).

export type Kind = "asset" | "liability" | "equity" | "income" | "expense";

export type Account = {
  id: number;
  code: string;
  name: string;
  kind: Kind;
  system_key: string | null;
  is_system: boolean;
  category: string;
  description: string | null;
  is_active: boolean;
  balance: string;
  has_entries: boolean;
};

export type PostingLine = { account_id: number; account_code: string; account_name: string; debit: string; credit: string; note?: string | null };

export type Posting = {
  date: string;
  source: string;
  source_label: string;
  source_id: number | null;
  voucher: string | null;
  narration: string;
  lines: PostingLine[];
};

export type DayBook = { from_date: string; to_date: string; items: Posting[]; total: number; page: number; page_size: number; total_debit: string; total_credit: string };

export type LedgerLine = {
  date: string;
  source: string;
  source_label: string;
  source_id: number | null;
  voucher: string | null;
  narration: string;
  against: string[];
  debit: string;
  credit: string;
  balance: string;
};

export type Ledger = { account: Account; from_date: string; to_date: string; opening: string; total_debit: string; total_credit: string; closing: string; lines: LedgerLine[] };

export type TrialRow = {
  account_id: number;
  code: string;
  name: string;
  kind: Kind;
  category: string;
  opening_debit: string;
  opening_credit: string;
  debit: string;
  credit: string;
  closing_debit: string;
  closing_credit: string;
};
type Cols = "opening_debit" | "opening_credit" | "debit" | "credit" | "closing_debit" | "closing_credit";
export type TrialBalance = {
  from_date: string;
  to_date: string;
  rows: TrialRow[];
  totals: Record<Cols, string>;
  balanced: boolean;
  difference: string;
  accounts: { id: number; code: string; name: string; kind: Kind }[];
};

export type StatementRow = { account_id: number; code: string; name: string; amount: string };

export type IERow = StatementRow & { category: string; opening: string; debit: string; credit: string; closing: string };
type IETotals = { opening: string; debit: string; credit: string; amount: string; closing: string };

export type IncomeExpenditure = {
  from_date: string;
  to_date: string;
  year_from: string;
  income: IERow[];
  total_income: string;
  income_totals: IETotals;
  expenses: IERow[];
  total_expenses: string;
  expense_totals: IETotals;
  surplus: string;
  opening_surplus: string;
  closing_surplus: string;
  categories: string[];
  accounts: { id: number; code: string; name: string; kind: "income" | "expense" }[];
};

export type BalanceSheet = {
  as_of: string;
  year_from: string;
  assets: StatementRow[];
  total_assets: string;
  liabilities: StatementRow[];
  total_liabilities: string;
  equity: StatementRow[];
  total_equity: string;
  surplus_previous_years: string;
  surplus_this_year: string;
  total_funds: string;
  balanced: boolean;
  asset_sections: BSSection[];
  liability_sections: BSSection[];
  net_assets: string;
  current_ratio: number | null;
  accounts: { id: number; code: string; name: string; kind: Kind }[];
};

export type BSRow = { account_id: number | null; code: string; name: string; amount: string; category: string; ref: string; schedule: number | null };
export type BSSection = { key: string; title: string; total: string; rows: BSRow[] };

export type Journal = {
  id: number;
  entry_no: string;
  entry_date: string;
  narration: string;
  reference: string | null;
  is_void: boolean;
  void_reason: string | null;
  created_by_name: string | null;
  created_at: string;
  total: string;
  lines: PostingLine[];
};
