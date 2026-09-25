"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { routeOf } from "@/lib/screens";
import { HOME_SCREEN } from "@/lib/session";
import { useHydrated, useSession } from "@/lib/useSession";

/** Where each signed-in role lands in the mobile app. */
function homeFor(role: string): string {
  if (role === "parent") return "/parent/home";
  if (role === "teacher") return "/teacher/today";
  if (role === "student") return "/student/home";
  return routeOf(HOME_SCREEN[role as keyof typeof HOME_SCREEN] ?? 3);
}

export function AppEntry() {
  const router = useRouter();
  const sess = useSession();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated && sess) router.replace(homeFor(sess.user.role));
  }, [hydrated, sess, router]);

  return (
    <div className="pm">
      <div className="phone no-nav">
        <div className="scroll-body">
          <div className="brand-label">BrightCampus</div>
          <h1>Who is signing in?</h1>
          <p className="lead">One app for your school: pick your account type.</p>
          <div className="role-pick">
            <Link href="/parent/parent-sign-in">
              <span className="v-icon blue">👪</span>
              <span>
                <strong>Parent</strong>
                <small>Attendance, homework, fees and messages for your children</small>
              </span>
            </Link>
            <Link href="/teacher/sign-in">
              <span className="v-icon purple">🧑‍🏫</span>
              <span>
                <strong>Teacher</strong>
                <small>Mark attendance, set homework and enter marks</small>
              </span>
            </Link>
            <Link href="/student/sign-in">
              <span className="v-icon amber">🎒</span>
              <span>
                <strong>Student</strong>
                <small>Timetable, homework and results</small>
              </span>
            </Link>
          </div>
          <p className="micro">Office staff sign in from the school workspace on a computer.</p>
        </div>
      </div>
    </div>
  );
}
