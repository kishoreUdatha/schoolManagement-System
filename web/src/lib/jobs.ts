"use client";

/*
 * Staff jobs: what a person can be given through the permission matrix
 * (a built-in role's permissions, or a custom role like "Librarian"), and
 * the screens each job opens in their menu. The backend admits a person to
 * a job's endpoints by the same permission, so the menu shows only doors
 * that open. GET /api/v1/staff/my-permissions says what the person holds.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export type Job = {
  permission: string;
  title: string;
  /** [screen number, menu label, extra permission the item needs] */
  items: [number, string, string?][];
};

/**
 * Screens that serve only some sign-in roles, whatever permissions the person
 * holds: the screen itself tells anyone else it is not theirs. Menus and tab
 * rows leave them out for everyone else, rather than open a door to a note.
 */
export const ROLE_ONLY: Record<number, string[]> = {
  250: ["school_admin", "teacher"], // PTM setup: the office, or a class teacher for their class
  254: ["school_admin", "teacher"], // bulk messages
  255: ["school_admin", "principal"], // communication history
  // School-wide reports are the admin's and the principal's (api/v1/school/analytics.py);
  // an accountant holding reports.view sees the money ones.
  ...Object.fromEntries([264, 266, 267, 268, 269, 270, 271, 272, 276, 278, 279, 282].map((n) => [n, ["school_admin", "principal"]])),
  275: ["school_admin", "accountant"], // finance summary: the cash book
};
export const usableBy = (n: number, role: string | undefined) => !role || !ROLE_ONLY[n] || ROLE_ONLY[n].includes(role);

export const JOBS: Job[] = [
  {
    permission: "admissions.manage",
    title: "Admissions",
    items: [
      [43, "Admissions dashboard"], [44, "Enquiries"], [47, "Follow-up calendar"], [48, "Applications"],
      [51, "Document verification"], [52, "Assessments"], [53, "Admission approvals", "admissions.decide"],
      [1002, "Campaigns"], [1001, "Online admission link"],
    ],
  },
  {
    permission: "library.manage",
    title: "Library",
    items: [
      [198, "Book catalogue"], [201, "Library members"], [202, "Issue book"], [203, "Return book"],
      [204, "Renew & reserve"], [205, "Fines & lost books"], [206, "Digital library"], [1073, "Library settings"], [207, "Library reports"],
    ],
  },
  {
    permission: "transport.manage",
    title: "Transport",
    items: [
      [1072, "Transport dashboard"], [186, "Vehicles"], [189, "Routes"], [191, "Stops"], [192, "Drivers & conductors"],
      [193, "Student assignment"], [194, "Trip sheets"], [196, "Boarding attendance"], [195, "Live GPS tracking"], [197, "Maintenance & fuel"],
    ],
  },
  {
    permission: "hostel.manage",
    title: "Hostel",
    items: [
      [208, "Hostels"], [209, "Rooms & beds"], [210, "Allocation"], [211, "Wardens"], [212, "Hostel attendance"],
      [213, "Leave & outings"], [214, "Mess & meals"], [215, "Complaints & fees"],
    ],
  },
  {
    permission: "inventory.manage",
    title: "Store & inventory",
    items: [
      [234, "Inventory dashboard"], [235, "Item catalogue"], [236, "Stock in"], [237, "Stock issue & return"],
      [238, "Suppliers"], [239, "Asset register"], [240, "Asset assignment"], [241, "Asset maintenance"],
      [1048, "School store sales"], [245, "Stock & asset reports"],
    ],
  },
  {
    permission: "frontdesk.manage",
    title: "Front desk",
    items: [
      [226, "Visitor dashboard"], [227, "Visitor check-in"], [228, "Visitor approval"], [230, "Visitor check-out"],
      [231, "Early pickup & gate pass"], [232, "Staff & vehicle gate log"], [233, "Security incidents"], [1070, "Visitor directory"],
      [1026, "Parent help desk"],
    ],
  },
  {
    permission: "hr.manage",
    title: "Recruitment & HR",
    items: [
      [172, "Requisitions"], [173, "Job openings"], [174, "Candidates"], [1060, "Candidate pool"], [176, "Interviews"],
      [177, "Offers"], [178, "Onboarding"], [180, "Leave policies"], [1061, "Leave balances"],
      [179, "Staff attendance"], [181, "Staff leave requests"], [182, "Leave approval"],
    ],
  },
  {
    permission: "exams.manage",
    title: "Examinations",
    items: [
      // marks entry and bulk import are the teacher's own screens, on the teacher API
      [138, "Exam dashboard"], [139, "Exam types"], [140, "Exam setup"], [141, "Exam schedule"],
      [142, "Hall allocation"], [143, "Invigilation"], [144, "Admit cards"],
      // verifying marks is signing them off: its own permission
      [146, "Practical marks"], [148, "Marks verification", "exams.approve_results"],
      [149, "Grading setup", "grading.manage"], [150, "Publish results"], [152, "Report cards"], [272, "Result analysis", "reports.view"],
    ],
  },
  {
    permission: "syllabus.manage",
    title: "Academics",
    items: [
      [98, "Curriculum"], [100, "Units & topics"], [101, "Learning outcomes"], [102, "Lesson plans"],
      [104, "Lesson plan review", "lessonplans.review"], [105, "Syllabus progress"], [106, "Teaching resources"],
      [108, "Academic calendar"], [109, "Co-curricular activities"], [107, "Rooms"],
    ],
  },
  {
    permission: "cover.manage",
    title: "Timetable & cover",
    // building the timetable is the office's (settings.manage); this is reading
    // it and covering for whoever is away
    items: [
      [120, "Timetable dashboard"], [123, "Teacher availability"], [125, "Class timetable"],
      [126, "Teacher timetable"], [127, "Substitutions"],
    ],
  },
  {
    permission: "health.manage",
    title: "Health & clinic",
    items: [
      [216, "Health dashboard"], [217, "Medical profiles"], [218, "Clinic visits"], [219, "Medication & first aid"],
      [220, "Immunisation & allergies"], [225, "Emergency contacts"],
    ],
  },
  {
    // counselling is its own confidence: a principal holds it without the clinic
    permission: "counselling.access",
    title: "Counselling",
    items: [[221, "Counselling appointments"], [222, "Case notes"]],
  },
  {
    permission: "fees.refund.approve",
    title: "Fees",
    items: [[165, "Refund approvals"]],
  },
  {
    permission: "discipline.manage",
    title: "Discipline",
    items: [[223, "Behaviour incidents"], [224, "Action & follow-up"]],
  },
  {
    permission: "notices.send",
    title: "Communication",
    items: [
      // (the messaging inbox is between parents and teachers: not a job)
      [252, "Announcements"], [254, "Notification campaigns"], [255, "Communication history"],
      [296, "Notification centre"], [246, "Events calendar", "events.manage"],
      [249, "Field trips & consent", "events.manage"], [250, "PTM setup", "events.manage"],
    ],
  },
  {
    permission: "students.manage",
    title: "Student records",
    items: [
      [55, "Student directory"], [56, "Add a student"], [1010, "Bulk import"], [1011, "Student logins"],
      [1012, "Enrolment history"], [69, "Promotion & transfer"], [70, "Exit & alumni"],
      [71, "Parent directory", "parents.manage"], [72, "Add a parent", "parents.manage"], [76, "Parent login access", "parents.manage"],
    ],
  },
  {
    permission: "attendance.correct",
    title: "Attendance office",
    items: [
      [113, "Attendance correction"], [117, "Monthly summary"], [118, "Chronic absence"], [119, "Attendance reports", "reports.view"],
      [115, "Student leave approval", "studentleave.decide"],
    ],
  },
  {
    permission: "fees.collect",
    title: "Fee counter",
    items: [[158, "Fee collection"], [160, "Payment receipt"], [161, "Student ledger"], [162, "Outstanding dues"], [159, "Online payments"]],
  },
  {
    permission: "payroll.manage",
    title: "Payroll",
    items: [[183, "Payroll setup"], [184, "Payroll processing"], [185, "Payslips & history"], [1062, "Salary history & bank files"], [277, "Payroll summary", "reports.view"]],
  },
  {
    permission: "staff.manage",
    title: "Staff records",
    items: [[80, "Staff directory"], [81, "Add staff"], [82, "Staff profile"], [1085, "Departments"]],
  },
  {
    permission: "reports.view",
    title: "Reports",
    items: [
      [264, "Analytics dashboard"], [266, "Student strength"], [268, "Attendance analytics"], [270, "Academic performance"],
      [273, "Fee collection"], [274, "Outstanding dues"], [275, "Finance summary"], [276, "Staff attendance"],
      [282, "Communication report"], [283, "Report builder"],
    ],
  },
];

const KEY = "bc_perms";
let memo: { user: number; perms: string[] } | null = null;

/**
 * What the signed-in person may do, or null until known. Remembered for the
 * tab (each screen draws its own sidebar), and refreshed in the background.
 */
export function usePermissions(): Set<string> | null {
  const user = useSession()?.user.id ?? null;
  // Empty on the first render (as on the server), then filled from what this
  // tab already knows, then refreshed from the API.
  const [perms, setPerms] = useState<string[] | null>(null);
  useEffect(() => {
    if (user === null) return;
    if (memo && memo.user === user) setPerms(memo.perms);
    else {
      try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { user: number; perms: string[] } | null;
        if (saved && saved.user === user) setPerms(saved.perms);
      } catch {
        /* storage unavailable */
      }
    }
    let live = true;
    api
      .get<string[]>("/api/v1/staff/my-permissions")
      .then((p) => {
        if (!live) return;
        memo = { user, perms: p };
        try {
          sessionStorage.setItem(KEY, JSON.stringify(memo));
        } catch {
          /* storage unavailable */
        }
        setPerms(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user]);
  return perms ? new Set(perms) : null;
}

/** The jobs this person holds, with the items they can open. */
export function heldJobs(perms: Set<string> | null): Job[] {
  if (!perms) return [];
  return JOBS.filter((j) => perms.has(j.permission)).map((j) => ({
    ...j,
    items: j.items.filter(([, , extra]) => !extra || perms.has(extra)),
  }));
}
