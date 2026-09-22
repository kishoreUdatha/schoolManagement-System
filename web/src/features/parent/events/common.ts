// Shapes from the parent events/PTM/calendar endpoints (PM-037…PM-040).

import type { Attachment } from "@/components/ui/Attachments";

export type CalendarItem = {
  type: "holiday" | "exam" | "event" | "ptm" | "ptm_slot" | string;
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  detail: string | null;
  is_draft: boolean;
  is_cancelled: boolean;
};

export type ChildConsent = { student_id: number; student_name: string; response: "yes" | "no" | null; note: string | null };

export type ParentEvent = {
  id: number;
  title: string;
  kind: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  description: string | null;
  audience_label: string;
  requires_consent: boolean;
  consent_deadline: string | null;
  fee_amount: string | null;
  is_published: boolean;
  is_cancelled: boolean;
  consent_open: boolean;
  children: ChildConsent[];
  /** Circulars and permission slips: GET …/events/{id}/files/{file_id}. */
  attachments?: Attachment[];
};

export type PtmSlot = {
  id: number;
  start_time: string;
  end_time: string;
  state: "open" | "mine" | "taken" | string;
  student_id: number | null;
  status: "open" | "booked" | "done" | "no_show" | null;
  teacher_notes: string | null;
};

export type PtmTeacher = { teacher_user_id: number; teacher_name: string; teaches: number[]; slots: PtmSlot[] };

export type PtmSession = {
  id: number;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  venue: string | null;
  notes: string | null;
  scope_label: string;
  booking_closes_at: string | null;
  is_published: boolean;
  booking_open: boolean;
  eligible_children: number[];
  teachers: PtmTeacher[];
};

export const PTM = "/api/v1/parent/me/ptm";
export const EVENTS = "/api/v1/parent/me/events";

/** yyyy-mm-dd in local time. */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-09-26" -> "Sat, 26 Sep". */
export function dayLabel(v: string): string {
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "2026-09-26" -> "Saturday, 26 September 2026". */
export function longDate(v: string): string {
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${wd}, ${d.getDate()} ${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const monthTitle = (d: Date) => `${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** A slot booked by this parent for this child, with its session and teacher. */
export function myBookings(sessions: PtmSession[] | null, childId: number | null) {
  const out: { session: PtmSession; teacher: PtmTeacher; slot: PtmSlot }[] = [];
  for (const s of sessions ?? []) for (const t of s.teachers) for (const x of t.slots) if (x.state === "mine" && x.student_id === childId) out.push({ session: s, teacher: t, slot: x });
  return out.sort((a, b) => (a.session.meeting_date + a.slot.start_time).localeCompare(b.session.meeting_date + b.slot.start_time));
}
