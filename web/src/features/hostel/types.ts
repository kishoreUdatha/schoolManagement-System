// Shapes returned by /api/v1/school/hostels/* and /ops/warden-rota.

export type Hostel = {
  id: number;
  name: string;
  kind: "boys" | "girls" | "mixed";
  warden_user_id: number | null;
  warden_name: string | null;
  warden_phone?: string | null;
  address: string | null;
  monthly_fee: string;
  curfew: string | null;
  is_active: boolean;
  rooms: number;
  beds: number;
  occupied: number;
};

export type Bed = { id: number; label: string; student_id: number | null; student_name: string | null; section_label: string | null; allocation_id: number | null; since: string | null };

export type Room = { id: number; room_no: string; floor: string | null; room_type: string | null; monthly_fee: string | null; effective_fee: string; is_active: boolean; beds: Bed[] };

export type RollStatus = "present" | "absent" | "on_leave";

export type RollDetail = { checked_in_at: string | null; is_late: boolean; remark: string | null };

export type Resident = {
  allocation_id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  room_no: string;
  bed_label: string;
  since: string;
  today: Partial<Record<"morning" | "night", RollStatus>>;
  today_details: Partial<Record<"morning" | "night", RollDetail>>;
  out_now: boolean;
};

export type OutingStatus = "requested" | "approved" | "rejected" | "out" | "returned" | "cancelled";

export type Outing = {
  id: number;
  student_id: number;
  student_name: string;
  kind: "outing" | "home_leave";
  leave_at: string;
  return_by: string;
  reason: string;
  escort_name: string | null;
  status: OutingStatus;
  requested_by_name: string | null;
  requested_by_parent: boolean;
  decision_note: string | null;
  went_out_at: string | null;
  returned_at: string | null;
  overdue: boolean;
  late_by_minutes: number | null;
};

export type Meal = "breakfast" | "lunch" | "snacks" | "dinner";
export type MenuSlot = { day_of_week: number; meal: Meal; items: string };

export type Complaint = {
  id: number;
  hostel_id: number;
  student_id: number | null;
  student_name: string | null;
  category: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  raised_by_name: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type Duty = { duty_id: number; hostel_id: number; hostel_name: string; user_id: number; warden_name: string; warden_phone: string | null; shift: "day" | "night" | "weekend"; note: string | null };

export type Rota = {
  from_date: string;
  to_date: string;
  days: { date: string; duties: Duty[] }[];
  uncovered: { date: string; hostel_id: number; hostel_name: string }[];
  uncovered_count: number;
};

export type StaffOption = { user_id: number; full_name: string; role: string };
