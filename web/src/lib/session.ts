/*
 * Who is signed in. Tokens live in localStorage, as in the old frontend, so
 * a signed-in tab survives a reload; nothing here is trusted by the server,
 * which checks the bearer token on every call.
 */

export type Role = "school_admin" | "principal" | "teacher" | "accountant" | "staff" | "parent" | "student" | "super_admin";

export type SessionUser = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  tenant_id: number | null;
  school_id: number | null;
  must_change_password?: boolean;
};

export type Session = { access: string; refresh: string; user: SessionUser };

/** The API prefix each role signs in and refreshes through. */
export const PORTAL: Record<Role, string> = {
  school_admin: "school",
  principal: "principal",
  teacher: "teacher",
  accountant: "accountant",
  staff: "staff",
  parent: "parent",
  student: "student",
  super_admin: "super-admin",
};

/** Where each role lands after signing in (mock screen numbers). */
export const HOME_SCREEN: Record<Role, number> = {
  school_admin: 33,
  principal: 34,
  teacher: 35,
  student: 36,
  parent: 37,
  accountant: 38,
  staff: 39,
  super_admin: 9,
};

export const ROLE_LABEL: Record<Role, string> = {
  school_admin: "School Admin",
  principal: "Principal",
  teacher: "Teacher",
  accountant: "Accountant",
  staff: "Staff",
  parent: "Parent",
  student: "Student",
  super_admin: "Super Admin",
};

const KEY = "bc_session";
const listeners = new Set<() => void>();

export const session = {
  get(): Session | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  set(s: Session) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable: the session lasts this page only */
    }
    listeners.forEach((f) => f());
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};
