import Link from "next/link";
import { HealthBadge } from "@/components/HealthBadge";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-brand-700">
          School Management System
        </h1>
        <HealthBadge />
      </header>

      <section className="mt-16">
        <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          One platform for parents, teachers, and admin.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Attendance, homework, exams, fees, behaviour ratings, and digital
          learning — with AI-generated weekly reports for every parent.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/super-admin/login"
            className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Super admin
          </Link>
          <Link
            href="/school/login"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            School admin
          </Link>
          <Link
            href="/teacher/login"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            Teacher
          </Link>
          <Link
            href="/staff/login"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            Staff
          </Link>
          <Link
            href="/parent/login"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            Parent
          </Link>
          <a
            href="http://127.0.0.1:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-white"
          >
            API docs
          </a>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="mt-24 border-t border-slate-200 pt-6 text-sm text-slate-500">
        Phase 1 MVP scaffold — Week 1 of 10
      </footer>
    </main>
  );
}

const features = [
  { title: "Parent portal", desc: "Attendance, marks, homework, fees in one view." },
  { title: "Teacher portal", desc: "Mark attendance, post homework, enter marks." },
  { title: "AI weekly reports", desc: "Auto-generated parent summary in plain language." },
  { title: "Multi-channel reminders", desc: "Email, SMS, WhatsApp, in-app." },
  { title: "Behaviour ratings", desc: "Teacher-rated discipline, participation, punctuality." },
  { title: "Digital learning", desc: "YouTube content tagged by class, subject, topic." },
];
