// SCR-055 · Student Directory
// Module: Students · Role: School Admin · Release: MVP · Stories: US-0109 / US-0110
// Mock: screens/SCR-055_Student_Directory.html
// Backend: the old frontend served this at /school/students — Year, class, section, status filters and search
// Wired: GET /api/v1/school/students, /classes, /academic-years. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StudentDirectory } from "@/features/students/StudentDirectory";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "SCR-055 · Student Directory · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-055" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/students/add-student" className="btn primary">
          <Icon name="plus" className="sm" />
          Add student
        </Link>
      </>}>
      <StudentDirectory />
    </AppShell>
  );
}
