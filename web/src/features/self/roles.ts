// Which roles each self-service portal serves. A plain module (not "use
// client") so the server pages can pass these to RoleGate and PageAction.

import type { Role } from "@/lib/session";

/** Everyone who checks in, is paid through payroll and borrows as staff (the /staff/* portal's StaffUser). */
export const EMPLOYEES: Role[] = ["teacher", "staff", "principal", "accountant"];
/** /staff/leaves also lets the school admin apply. */
export const LEAVE_APPLICANTS: Role[] = [...EMPLOYEES, "school_admin"];
export const TEACHERS: Role[] = ["teacher"];
