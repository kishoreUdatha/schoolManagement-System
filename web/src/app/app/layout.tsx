import type { ReactNode } from "react";
import "@/styles/parent.css";
import "@/styles/parent-app.css";
import "@/styles/teacher-app.css";

export const metadata = { title: "BrightCampus" };

export default function AppEntryLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
