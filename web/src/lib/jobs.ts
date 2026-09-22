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
    ],
  },
  {
    permission: "hr.manage",
    title: "Recruitment & HR",
    items: [
      [172, "Requisitions"], [173, "Job openings"], [174, "Candidates"], [1060, "Candidate pool"], [176, "Interviews"],
      [177, "Offers"], [178, "Onboarding"], [180, "Leave policies"], [1061, "Leave balances"],
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
