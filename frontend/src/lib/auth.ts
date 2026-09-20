const TOKEN_KEY = "sms_token";
const REFRESH_KEY = "sms_refresh";
const USER_KEY = "sms_user";

export type SmsUser = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  tenant_id: number | null;
  school_id: number | null;
  /** Somebody else chose this password. The guards send them to
   *  pick their own before anything else. */
  must_change_password?: boolean;
};

export const auth = {
  setSession(access: string, refresh: string, user: SmsUser) {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): SmsUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SmsUser;
    } catch {
      return null;
    }
  },

  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isSuperAdmin(): boolean {
    return auth.getUser()?.role === "super_admin";
  },
};
