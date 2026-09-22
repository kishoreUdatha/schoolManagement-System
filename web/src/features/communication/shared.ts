"use client";

// Shapes and small helpers for Events / PTM / Communication.

import { useEffect, useMemo } from "react";
import type { Attachment } from "@/components/ui/Attachments";
import type { Role } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";

/* ---------- who is looking ---------- */

/** The signed-in role once the session is readable; null before then. */
export function useRole(): Role | null {
  const hydrated = useHydrated();
  const s = useSession();
  return hydrated ? (s?.user.role ?? null) : null;
}

/** Roles that use the school's staff endpoints (/api/v1/school/*, /staff/*). */
export const STAFF_ROLES: Role[] = ["school_admin", "principal", "teacher", "accountant", "staff"];

/* ---------- classes of the current year ---------- */

type Year = { id: number; name: string; is_current: boolean };
export type SectionLite = { id: number; name: string };
export type ClassLite = { id: number; name: string; sections: SectionLite[] };

/** Classes (with sections) of the school's current academic year. */
export function useCurrentClasses(enabled = true) {
  const years = useApi<Year[]>(enabled ? "/api/v1/school/academic-years" : null);
  const yearId = useMemo(() => (years.data?.length ? (years.data.find((y) => y.is_current) ?? years.data[0]).id : null), [years.data]);
  const classes = useApi<ClassLite[]>(enabled && yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  return { classes: classes.data ?? [], error: years.error ?? classes.error, loading: years.loading || classes.loading };
}

/* ---------- events ---------- */

export type EventAudience = "everyone" | "staff" | "parents" | "class_parents" | "section_parents";
export const EVENT_KINDS = ["academic", "cultural", "sports", "trip", "celebration", "meeting", "other"] as const;
export const EVENT_AUDIENCE: Record<EventAudience, string> = {
  everyone: "Everyone (parents and staff)",
  staff: "Staff only",
  parents: "All parents",
  class_parents: "Parents of one class",
  section_parents: "Parents of one section",
};

export type SchoolEvent = {
  id: number;
  title: string;
  kind: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  description: string | null;
  audience: EventAudience;
  class_id: number | null;
  section_id: number | null;
  audience_label: string;
  requires_consent: boolean;
  consent_deadline: string | null;
  fee_amount: string | null;
  coordinator: string | null;
  capacity: number | null;
  is_published: boolean;
  published_at: string | null;
  is_cancelled: boolean;
  consent_yes: number;
  consent_no: number;
  /** Circulars and permission slips; open via …/events/{id}/files/{file_id}. */
  attachments?: Attachment[];
};

export type ParentEvent = SchoolEvent & {
  consent_open: boolean;
  children: { student_id: number; student_name: string; response: "yes" | "no" | null; note: string | null }[];
};

export type ConsentReport = {
  event: SchoolEvent;
  eligible: number;
  yes: number;
  no: number;
  pending: number;
  rows: {
    student_id: number;
    student_name: string;
    admission_no: string | null;
    class_label: string | null;
    response: "yes" | "no" | null;
    note: string | null;
    responded_at: string | null;
    parent_name: string | null;
  }[];
};

export type Register = {
  event: { id: number; title: string; start_date: string; venue: string | null };
  requires_consent: boolean;
  eligible: number;
  consented: number;
  attended: number;
  unmarked: number;
  consented_absent: number;
  came_without_consent: number;
  rows: {
    student_id: number;
    student_name: string;
    admission_no: string;
    class_label: string | null;
    consent: string | null;
    consented: boolean;
    attended: boolean | null;
    note: string | null;
    marked_by: string | null;
    marked_at: string | null;
    consented_absent: boolean;
    came_without_consent: boolean;
  }[];
};

export type CalendarItem = {
  type: "event" | "holiday" | "exam" | "ptm" | "ptm_slot";
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

/** "16:30:00" -> "04:30 PM"; empty -> "". */
export function hhmm(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** yyyy-mm-dd in local time. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function eventStatus(e: Pick<SchoolEvent, "is_cancelled" | "is_published">): string {
  return e.is_cancelled ? "Cancelled" : e.is_published ? "Published" : "Draft";
}

/* ---------- PTM ---------- */

export type PtmSession = {
  id: number;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  venue: string | null;
  notes: string | null;
  class_id: number | null;
  section_id: number | null;
  scope_label: string;
  booking_closes_at: string | null;
  is_published: boolean;
  teacher_count: number;
  slot_count: number;
  booked_count: number;
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
  meeting_mode: MeetingMode | null;
  teacher_notes: string | null;
};

export type PtmDetail = PtmSession & { teachers: { teacher_user_id: number; teacher_name: string; slots: PtmSlot[] }[] };
export type TeacherPtm = PtmSession & { slots: PtmSlot[]; created_by_user_id?: number | null };
export type ParentSlot = {
  id: number;
  start_time: string;
  end_time: string;
  state: "open" | "mine" | "taken";
  student_id: number | null;
  status: "booked" | "done" | "no_show" | null;
  meeting_mode: MeetingMode | null;
  teacher_notes: string | null;
};

export type MeetingMode = "in_person" | "video" | "phone";
export const MEETING_MODE: Record<MeetingMode, string> = { in_person: "In person", video: "Video call", phone: "Phone call" };
export type ParentPtm = PtmSession & {
  booking_open: boolean;
  eligible_children: number[];
  teachers: { teacher_user_id: number; teacher_name: string; teaches: number[]; slots: ParentSlot[] }[];
};

export const SLOT_STATUS: Record<PtmSlot["status"], string> = { open: "Open", booked: "Booked", done: "Met", no_show: "Missed" };

/* ---------- notices ---------- */

export type NoticeAudience = "all_parents" | "all_teachers" | "all_staff" | "class_parents" | "section_parents" | "single_parent";
export type Channel = "in_app" | "email" | "sms" | "whatsapp";
export const CHANNELS: Channel[] = ["in_app", "email", "sms", "whatsapp"];
export const CHANNEL_LABEL: Record<string, string> = { in_app: "In-app", email: "Email", sms: "SMS", whatsapp: "WhatsApp" };
export const NOTICE_AUDIENCE: Record<NoticeAudience, string> = {
  all_parents: "All parents",
  all_teachers: "All teachers",
  all_staff: "All staff",
  class_parents: "Parents of a class",
  section_parents: "Parents of a section",
  single_parent: "One family",
};

export type Delivery = { channel: string; total: number; sent: number; delivered: number; failed: number; skipped: number; queued?: number; read?: number };

export type Notice = {
  id: number;
  title: string;
  body: string;
  audience: NoticeAudience;
  audience_class_id: number | null;
  audience_class_name: string | null;
  audience_section_id: number | null;
  audience_section_label: string | null;
  audience_student_id: number | null;
  audience_student_label: string | null;
  channels: Channel[];
  attachment_url: string | null;
  scheduled_at: string | null;
  /** What it is about (parents filter and mute by it). */
  category?: string;
  event_date?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  event_venue?: string | null;
  sent_at: string | null;
  status: "draft" | "scheduled" | "sent" | "failed";
  created_at: string;
  recipient_count: number;
  delivery: Delivery[];
};

/** "Parents of a class — Grade 1" and the like, from what the API resolved. */
export function noticeAudience(n: Pick<Notice, "audience" | "audience_class_name" | "audience_section_label" | "audience_student_label">): string {
  const base = NOTICE_AUDIENCE[n.audience] ?? n.audience;
  const detail = n.audience_student_label ?? n.audience_section_label ?? n.audience_class_name;
  return detail ? `${base} · ${detail}` : base;
}

/**
 * What the API reports for a notice's delivery, in its own words: sent,
 * queued, skipped and failed kept apart. Never says "delivered" unless the
 * provider reported a delivery.
 */
export function deliveryLine(d: Delivery[]): string {
  if (!d.length) return "Nothing handed to any channel yet";
  return d
    .map((c) => {
      const parts = [
        c.delivered ? `${c.delivered} delivered` : "",
        c.sent ? `${c.sent} sent` : "",
        c.queued ? `${c.queued} queued` : "",
        c.skipped ? `${c.skipped} skipped` : "",
        c.failed ? `${c.failed} failed` : "",
      ].filter(Boolean);
      return `${CHANNEL_LABEL[c.channel] ?? c.channel}: ${parts.join(", ") || "none"}`;
    })
    .join(" · ");
}

/* ---------- inbox ---------- */

export type InboxItem = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  sent_at: string | null;
  read_at: string | null;
  attachment_url?: string | null;
  status?: string;
};

/** Run once when a window CustomEvent fires (page-head buttons -> live panel). */
export function useWindowEvent(name: string, handler: () => void) {
  useEffect(() => {
    const h = () => handler();
    window.addEventListener(name, h);
    return () => window.removeEventListener(name, h);
  }, [name, handler]);
}

/** Save rows as a CSV file in the browser. */
export function downloadCsv(filename: string, head: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
