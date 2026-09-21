"use client";

import type { ReactNode } from "react";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { StudentBanner, useStudent } from "./StudentProfile";
import type { StudentProfile } from "./types";

/**
 * The frame every per-student screen shares: pick a student first, wait for
 * the record, then the banner with the profile tabs and the screen body.
 * `banner={false}` keeps the checks but lets the screen draw its own header.
 */
export function StudentFrame({
  active,
  banner = true,
  children,
}: {
  active: number;
  banner?: boolean;
  children: (s: StudentProfile) => ReactNode;
}) {
  const { id, data: s, error, loading } = useStudent();
  if (!id) return <PickFirst what="student" href={routeOf(55)} cta="Open the student directory" />;
  if (loading && !s) return <Loading what="Loading the student…" />;
  if (!s) return <ErrorNote>{error ?? "Student not found."}</ErrorNote>;
  return (
    <>
      {banner ? <StudentBanner s={s} active={active} /> : null}
      {children(s)}
    </>
  );
}

/** A definition list in the mock's `.kv` style. */
export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-09-21" -> "Monday" (read as a calendar date, not a UTC instant). */
export function dayName(v: string) {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

/** Today as YYYY-MM-DD in the viewer's zone. */
export function today() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** "2026-09" -> "September 2026". */
export function monthName(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** "07:10:00" -> "07:10 AM". */
export function clock(v: string | null | undefined) {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
