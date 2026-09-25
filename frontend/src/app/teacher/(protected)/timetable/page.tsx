"use client";

import { useEffect, useState } from "react";

import { Segmented } from "@/components/timetable/TimetableFrame";
import { MyTimetable } from "@/components/timetable/MyTimetable";
import { TimetableWorkspace } from "@/components/timetable/TimetableWorkspace";
import type { Scope } from "@/components/timetable/types";
import { api } from "@/lib/api";

type Tab = "mine" | "manage";

export default function TeacherTimetablePage() {
  const [isHod, setIsHod] = useState(false);
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    api
      .get<Scope>("/api/v1/timetable/scope")
      .then((r) => setIsHod(r.data.is_hod))
      .catch(() => setIsHod(false));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {tab === "mine" && <h1 className="text-2xl font-bold text-ink">My timetable</h1>}
        {isHod && (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "mine", label: "My timetable" },
              { value: "manage", label: "Manage sections (HOD)" },
            ]}
          />
        )}
      </div>
      {tab === "mine" ? <MyTimetable /> : <TimetableWorkspace heading="Section timetables" />}
    </div>
  );
}
