import type { ReactNode } from "react";
import "@/styles/parent.css";
import "@/styles/parent-app.css";

export const metadata = { title: "BrightCampus Parent" };

/** The parent app's styles load only under /parent. */
export default function ParentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
