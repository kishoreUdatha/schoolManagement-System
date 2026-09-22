/** The child's hostel stay (GET …/hostel); the API returns null for day scholars. */
export type ChildHostel = {
  hostel_id: number;
  hostel_name: string;
  room_no: string;
  bed_label: string;
  since: string;
  warden_name: string | null;
  warden_phone: string | null;
  curfew: string | null;
  menu_today: Record<string, string>;
  attendance_last_7_days: { date: string; session: string; status: string }[];
};
