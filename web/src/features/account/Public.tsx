"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { routeOf } from "@/lib/screens";
import { HOME_SCREEN, ROLE_LABEL, type Role } from "@/lib/session";
import { useSession } from "@/lib/useSession";

const WORKSPACES: { role: Role; icon: IconName; note: string }[] = [
  { role: "school_admin", icon: "grid", note: "School operations" },
  { role: "principal", icon: "building", note: "School leadership" },
  { role: "teacher", icon: "book", note: "Classes & assessment" },
  { role: "student", icon: "cap", note: "Learning & progress" },
  { role: "parent", icon: "users", note: "Your children" },
  { role: "accountant", icon: "money", note: "Fees & finance" },
  // office and support staff: librarian, HR, store, front desk, warden…
  { role: "staff", icon: "users", note: "Office & support" },
];

/** SCR-002. Public: picking a workspace leads to sign-in for that role. */
export function RoleSelection() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("school_admin");
  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`${routeOf(3)}?role=${role}`);
      }}
    >
      <h1>Choose your workspace</h1>
      <p>Choose the role you use at your school.</p>
      <div className="auth-options" role="radiogroup" aria-label="Workspace">
        {WORKSPACES.map((w) => (
          <button
            key={w.role}
            type="button"
            role="radio"
            aria-checked={role === w.role}
            className={`role-option ${role === w.role ? "active" : ""}`}
            onClick={() => setRole(w.role)}
            onDoubleClick={() => router.push(`${routeOf(3)}?role=${w.role}`)}
          >
            <Icon name={w.icon} />
            <span>
              <strong>{ROLE_LABEL[w.role]}</strong>
              <small>{w.note}</small>
            </span>
          </button>
        ))}
      </div>
      <button type="submit" className="btn primary">
        <Icon name="arrow" className="sm" />
        Continue to workspace
      </button>
      <div className="auth-note">
        {"School staff in other teams (office, library, transport) use the "}
        <Link href={`${routeOf(3)}?role=staff`}>staff workspace</Link>.
      </div>
    </form>
  );
}

/** SCR-001: the header's sign-in button, or the way back in when signed in. */
export function LandingSignIn() {
  const sess = useSession();
  if (sess) {
    return (
      <Link href={routeOf(HOME_SCREEN[sess.user.role])} className="btn primary">
        Open my workspace
      </Link>
    );
  }
  return (
    <Link href={routeOf(2)} className="btn primary">
      Sign in
    </Link>
  );
}

/** SCR-001: the hero's second button goes to your own dashboard, or to sign-in. */
export function LandingDashboardLink() {
  const sess = useSession();
  return (
    <Link href={sess ? routeOf(HOME_SCREEN[sess.user.role]) : routeOf(2)} className="btn">
      {sess ? `Go to ${ROLE_LABEL[sess.user.role]} dashboard` : "View school dashboard"}
    </Link>
  );
}

/** SCR-001, live: GET /api/v1/health (public), the old home page's badge. */
export function HealthBadge() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/health")
      .then(async (r) => {
        const d = r.ok ? await r.json() : null;
        if (alive) setState(d?.status === "ok" ? "ok" : "down");
      })
      .catch(() => alive && setState("down"));
    return () => {
      alive = false;
    };
  }, []);
  const text = { checking: "Checking service…", ok: "All systems running", down: "Service unavailable right now" }[state];
  return (
    <span className={`badge ${state === "ok" ? "" : state === "down" ? "bad" : "neutral"}`} role="status">
      {text}
    </span>
  );
}
