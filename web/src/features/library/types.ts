// Shapes returned by /api/v1/school/library/* and /analytics/library.

export type CopyStatus = "available" | "issued" | "on_hold" | "lost" | "damaged" | "withdrawn";

export type Copy = {
  id: number;
  accession_no: string;
  status: CopyStatus;
  price: string | null;
  acquired_on: string | null;
  condition_note: string | null;
  borrower_name: string | null;
  due_on: string | null;
};

export type Book = {
  id: number;
  title: string;
  authors: string | null;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
  publish_year: number | null;
  category: string | null;
  language: string | null;
  shelf: string | null;
  description: string | null;
  digital_url: string | null;
  is_reference: boolean;
  is_active: boolean;
  total_copies: number;
  available_copies: number;
  waiting_reservations: number;
};

export type BookDetail = Book & { copies: Copy[] };

export type FineStatus = "none" | "pending" | "billed" | "paid" | "waived";

export type Loan = {
  id: number;
  copy_id: number;
  accession_no: string;
  book_id: number;
  title: string;
  borrower_type: "student" | "staff";
  student_id: number | null;
  user_id: number | null;
  borrower_name: string;
  borrower_detail: string | null;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  lost_on: string | null;
  renew_count: number;
  overdue_days: number;
  fine_amount: string;
  accruing_fine: string;
  fine_status: FineStatus;
  fine_note: string | null;
};

export type Member = {
  borrower_type: "student" | "staff";
  student_id: number | null;
  user_id: number | null;
  name: string;
  detail: string | null;
  out: number;
  overdue: number;
  fine_due: string;
  limit: number;
  can_borrow: boolean;
  borrowed_ever: number;
  last_issued_on: string | null;
};

export type Fine = {
  loan_id: number;
  accession_no: string;
  title: string;
  borrower_type: "student" | "staff";
  borrower_name: string;
  student_id: number | null;
  user_id: number | null;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  overdue_days: number;
  amount: string;
  status: FineStatus;
  note: string | null;
};

export type Fines = { pending: number; pending_amount: string; collected_amount: string; waived_amount: string; billed_amount: string; fines: Fine[] };

export type Reservation = {
  id: number;
  book_id: number;
  title: string;
  borrower_name: string;
  status: "waiting" | "ready" | "fulfilled" | "cancelled" | "expired";
  queue_position: number | null;
  hold_until: string | null;
  held_accession_no: string | null;
  created_at: string;
};

export type LibrarySettings = {
  loan_days_student: number;
  loan_days_staff: number;
  max_books_student: number;
  max_books_staff: number;
  max_renewals: number;
  fine_per_day: string;
  max_fine_per_loan: string | null;
  hold_days: number;
};

export type LibraryUsage = {
  from_date: string;
  to_date: string;
  issued: number;
  returned: number;
  copies: number;
  out_now: number;
  shelf_in_use: number;
  by_month: { month: string; issued: number; returned: number }[];
  top_titles: { book_id: number; title: string; times: number }[];
};

export type StaffOption = { user_id: number; full_name: string; role: string };

/** Who borrows: a student or a staff member. */
export type Borrower = { borrower_type: "student"; student_id: number; label: string } | { borrower_type: "staff"; user_id: number; label: string };
