import type { ReactNode } from "react";
import "@/styles/parent.css";
import "@/styles/parent-app.css";
import "@/styles/teacher-app.css";

export const metadata = { title: "BrightCampus Teacher" };

/** The teacher app uses the parent app's phone styles (scoped under .pm). */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
