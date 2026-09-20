"use client";

import Link from "next/link";
import {
  Banknote,
  BriefcaseBusiness,
  Building2,
  GraduationCap,
  School,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/Card";

/** Every portal that has a sign-in page of its own.
 *
 *  Each account belongs to exactly one of these, so the chooser is a list of
 *  doors rather than a setting. Verified against src/app/*&#47;login — no link
 *  here points at a route that does not exist. */
const PORTALS = [
  {
    href: "/school/login",
    label: "School office",
    blurb: "Admissions, students, staff, fees and settings",
    icon: School,
  },
  {
    href: "/principal/login",
    label: "Principal",
    blurb: "Approvals, results and everything across the school",
    icon: ShieldCheck,
  },
  {
    href: "/teacher/login",
    label: "Teacher",
    blurb: "Your classes, attendance, marks and homework",
    icon: GraduationCap,
  },
  {
    href: "/parent/login",
    label: "Parent",
    blurb: "Your child's attendance, homework, fees and results",
    icon: Users,
  },
  {
    href: "/student/login",
    label: "Student",
    blurb: "Your homework, results and timetable",
    icon: UserRound,
  },
  {
    href: "/accountant/login",
    label: "Accountant",
    blurb: "Fees, payments and the books",
    icon: Banknote,
  },
  {
    href: "/staff/login",
    label: "Staff",
    blurb: "Attendance, leave and payslips",
    icon: BriefcaseBusiness,
  },
  {
    href: "/super-admin/login",
    label: "Platform",
    blurb: "Tenants, plans and the platform itself",
    icon: Building2,
  },
];

export default function WorkspacePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-1px] text-ink">
            Where are you signing in?
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Pick the one that matches your account — signing in to the wrong one
            will not work.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {PORTALS.map((p) => (
            <Link key={p.href} href={p.href}>
              <Card className="h-full transition-colors hover:border-brand-300 hover:bg-surface-hover">
                <CardBody className="flex items-start gap-3 p-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600"
                    aria-hidden="true"
                  >
                    <p.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold text-ink">{p.label}</div>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                      {p.blurb}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        <p className="text-center text-[12px] text-ink-subtle">
          Forgotten your password?{" "}
          <Link
            href="/account/forgot-password"
            className="font-bold text-brand-600 hover:underline"
          >
            Get a reset code
          </Link>
          . Students sign in with an admission number, so the school office
          resets those.
        </p>
      </div>
    </div>
  );
}
