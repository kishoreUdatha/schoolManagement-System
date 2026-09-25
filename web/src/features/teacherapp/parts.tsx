"use client";

/* Small helpers shared by the teacher app's screens. */

export { PmEmpty, PmError, PmLoading, todayIso } from "@/features/parent/home/parts";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 26 Sep" from YYYY-MM-DD. */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** "08:30" from "08:30:00". */
export const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Types of the teacher endpoints the app reads. */
export type ClassTeacherCard = {
  section_id: number;
  class_id: number;
  section_label: string;
  is_current_year: boolean;
  student_count: number;
};
export type SubjectCard = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_name: string;
  subject_code: string;
  is_current_year: boolean;
  sections: { section_id: number; section_name: string; student_count: number }[];
  total_students: number;
};
export type MyClasses = { class_teacher_of: ClassTeacherCard[]; subject_teacher_of: SubjectCard[] };
export const MY_CLASSES = "/api/v1/teacher/my-classes";

/** "1 student", "6 students". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
