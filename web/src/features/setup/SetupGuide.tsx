"use client";

/*
 * Setup wizard (on SCR-289 School Settings). A step-by-step wizard for everything a new school
 * has to set up, one step at a time with Back / Next. Each step ticks itself
 * off from the school's real data and is finished right here: school
 * details, the year and its terms, classes with sections, subjects for
 * every class, the day's periods, the CBSE grading scale, staff logins, fee
 * amounts per class and students with their parent logins. Online payments
 * and WhatsApp (optional) link to their own screens.
 *
 * Reads: /profile, /academic-years (+ /terms), /classes, /subjects,
 * /classes/{id}/subjects, /periods, /grade-scales, /staff, /fees/heads,
 * /fees/structures, /students, /payments/gateway, /whatsapp. Writes go
 * through the same endpoints the screens use, so the same checks apply.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";

type Year = { id: number; name: string; is_current: boolean; start_date: string; end_date: string };
type Klass = { id: number; name: string; sections: { id: number; name: string }[] };
type Profile = { name: string; code: string; timezone: string; principal_name: string | null; board: string | null; address: string | null; phone_primary: string | null; email: string | null; working_days: string; logo_url: string | null; school_start_time: string | null; school_end_time: string | null };
type Paged = { total: number };

export type SetupStep = { key: string; short: string; title: string; why: string; done: boolean; optional?: boolean; detail?: string };

/** What is set up, as the guide and the dashboard's progress strip see it. */
export function useSetupStatus() {
  const profile = useApi<Profile>("/api/v1/school/profile");
  const years = useApi<Year[]>("/api/v1/school/academic-years");
  const current = years.data?.find((y) => y.is_current) ?? null;
  const terms = useApi<unknown[]>(current ? `/api/v1/school/academic-years/${current.id}/terms` : null);
  const classes = useApi<Klass[]>(current ? "/api/v1/school/classes" : null, { academic_year_id: current?.id });
  const subjects = useApi<{ id: number; name: string; code: string }[]>("/api/v1/school/subjects");
  const firstClass = classes.data?.[0];
  const taught = useApi<unknown[]>(firstClass ? `/api/v1/school/classes/${firstClass.id}/subjects` : null);
  const periods = useApi<unknown[]>("/api/v1/school/periods");
  const scales = useApi<{ is_default: boolean; is_active: boolean }[]>("/api/v1/school/grade-scales");
  const staff = useApi<unknown[]>("/api/v1/school/staff");
  const fees = useApi<unknown[]>(current ? "/api/v1/school/fees/structures" : null, { academic_year_id: current?.id });
  const students = useApi<Paged>("/api/v1/school/students", { page_size: 1 });
  const gateway = useApi<{ configured: boolean }>("/api/v1/school/payments/gateway");
  const whatsapp = useApi<{ configured: boolean }>("/api/v1/school/whatsapp");

  const p = profile.data;
  const cls = classes.data ?? [];
  const steps: SetupStep[] = [
    { key: "profile", short: "School", title: "School details", why: "Address, phone and email appear on receipts, report cards and certificates.", done: Boolean(p?.address && p?.phone_primary && p?.email) },
    { key: "year", short: "Year", title: "Academic year and terms", why: "Classes, attendance, fees and exams all belong to the current year.", done: Boolean(current && (terms.data?.length ?? 0) > 0), detail: current ? `${current.name}${terms.data ? ` · ${terms.data.length} term(s)` : ""}` : undefined },
    { key: "classes", short: "Classes", title: "Classes and sections", why: "Students are admitted into a section of a class.", done: cls.length > 0 && cls.every((c) => c.sections.length > 0), detail: cls.length ? `${cls.length} classes · ${cls.reduce((n, c) => n + c.sections.length, 0)} sections` : undefined },
    { key: "subjects", short: "Subjects", title: "Subjects", why: "Needed for the timetable, homework, marks and report cards.", done: (subjects.data?.length ?? 0) > 0 && (taught.data?.length ?? 0) > 0, detail: subjects.data?.length ? `${subjects.data.length} subjects` : undefined },
    { key: "periods", short: "Periods", title: "School day (periods)", why: "The timetable is built on these periods.", done: (periods.data?.length ?? 0) > 0 },
    { key: "grading", short: "Grading", title: "Grading scale", why: "Turns marks into grades on report cards.", done: Boolean(scales.data?.some((s) => s.is_default && s.is_active)) },
    { key: "staff", short: "Staff", title: "Staff", why: "Teachers and office staff each get their own login.", done: (staff.data?.length ?? 0) > 0, detail: staff.data?.length ? `${staff.data.length} staff` : undefined },
    { key: "fees", short: "Fees", title: "Fees", why: "What each class pays, so fees can be raised and collected.", done: (fees.data?.length ?? 0) > 0 },
    { key: "students", short: "Students", title: "Students", why: "Add them one by one, import a spreadsheet, or admit them through admissions.", done: (students.data?.total ?? 0) > 0, detail: students.data?.total ? `${students.data.total} student${students.data.total === 1 ? "" : "s"}` : undefined },
    { key: "payments", short: "Payments", title: "Online fee payments", why: "Your Razorpay account, so parents can pay from the app.", done: Boolean(gateway.data?.configured), optional: true },
    { key: "whatsapp", short: "WhatsApp", title: "WhatsApp", why: "Send notices, alerts and sign-in codes on your WhatsApp number.", done: Boolean(whatsapp.data?.configured), optional: true },
  ];
  // settled = every query that can run has answered (the first step to open depends on all of them)
  const pending = (q: { data: unknown; error: string | null }, runs = true) => runs && q.data === null && q.error === null;
  const loading =
    [profile, years, subjects, periods, scales, staff, students, gateway, whatsapp].some((q) => pending(q)) ||
    pending(terms, Boolean(current)) || pending(classes, Boolean(current)) || pending(fees, Boolean(current)) || pending(taught, Boolean(firstClass));
  const reload = () => {
    for (const x of [profile, years, terms, classes, subjects, taught, periods, scales, staff, fees, students, gateway, whatsapp]) x.reload();
  };
  const required = steps.filter((s) => !s.optional);
  return {
    steps, loading, reload, current, classes: cls, subjects: subjects.data ?? [], profile: p,
    done: required.filter((s) => s.done).length, total: required.length,
  };
}

/** The dashboard strip: shown until the required steps are done. */
export function SetupProgressStrip() {
  const s = useSetupStatus();
  if (s.loading || s.done >= s.total) return null;
  const next = s.steps.find((x) => !x.done && !x.optional);
  return (
    <div className="setup-strip">
      <div className="setup-strip-bar">
        <i style={{ width: `${Math.round((s.done / s.total) * 100)}%` }} />
      </div>
      <div className="setup-strip-text">
        <strong>{`Finish setting up your school · ${s.done} of ${s.total} done`}</strong>
        {next ? <span>{`Next: ${next.title}`}</span> : null}
      </div>
      <Link href={routeOf(289)} className="btn primary">
        <Icon name="arrow" className="sm" />
        Continue setup
      </Link>
    </div>
  );
}

// ---------- the guide ----------

const CLASS_PRESETS = ["Nursery", "LKG", "UKG", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];
const SUBJECT_PRESETS: [string, boolean][] = [
  ["English", true], ["Hindi", true], ["Telugu", false], ["Mathematics", true], ["Science", true], ["Social Studies", true],
  ["Environmental Studies (EVS)", false], ["Computer Science", true], ["General Knowledge", false], ["Physical Education", false],
  ["Art", false], ["Music", false], ["Sanskrit", false], ["Physics", false], ["Chemistry", false], ["Biology", false],
];
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function defaultYear() {
  const now = new Date();
  const y = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1; // from March, plan the year starting this April
  return { name: `${y}-${String(y + 1).slice(2)}`, start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

function splitTerms(start: string, end: string, n: number): { name: string; start_date: string; end_date: string }[] {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  const day = 86_400_000;
  const span = Math.floor((b - a) / day) + 1;
  const iso = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return Array.from({ length: n }, (_, i) => {
    const s = a + Math.floor((span * i) / n) * day;
    const e = i === n - 1 ? b : a + (Math.floor((span * (i + 1)) / n) - 1) * day;
    return { name: n === 2 ? `Semester ${i + 1}` : `Term ${i + 1}`, start_date: iso(s), end_date: iso(e) };
  });
}

function subjectCode(name: string, taken: Set<string>): string {
  const base = name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).map((w, i, all) => (all.length > 1 ? w[0] : w.slice(0, 4))).join("").toUpperCase().slice(0, 6) || "SUB";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}${i}`;
  taken.add(code);
  return code;
}

const hm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const toMins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function SetupGuide() {
  const s = useSetupStatus();
  // index into s.steps; s.steps.length is the "all set" screen
  const [at, setAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (s.loading || at !== null) return;
    const first = s.steps.findIndex((x) => !x.done && !x.optional);
    setAt(first === -1 ? s.steps.length : first);
  }, [s.loading, s.steps, at]);

  const go = (i: number) => {
    setError(null);
    setProgress(null);
    setAt(Math.max(0, Math.min(s.steps.length, i)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Save a step, then move on to the next one.
  async function run(label: string, fn: () => Promise<void>, stay = false) {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      await fn();
      notify(label);
      s.reload();
      if (!stay && at !== null) go(at + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (s.loading || at === null) return <div className="panel" style={{ padding: 24 }}>Loading your school’s setup…</div>;

  const pct = Math.round((s.done / s.total) * 100);
  const step = s.steps[at];
  const finished = at >= s.steps.length;
  return (
    <div className="setup-guide wizard">
      <div className="wizard-top">
        <div className="wizard-meter">
          <div className="setup-strip-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span>{`${s.done} of ${s.total} essential steps done`}</span>
        </div>
        <ol className="wizard-rail">
          {s.steps.map((x, i) => (
            <li key={x.key}>
              <button type="button" className={`wizard-dot ${x.done ? "done" : ""} ${i === at ? "on" : ""}`} onClick={() => go(i)} title={x.title}>
                <span className="setup-num">{x.done ? <Icon name="check" className="sm" /> : i + 1}</span>
                <span className="wizard-dot-label">{x.short}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {finished ? (
        <FinishCard s={s} go={go} />
      ) : (
        <div className="panel wizard-card">
          <div className="wizard-card-head">
            <div>
              <small className="muted">{`Step ${at + 1} of ${s.steps.length}${step.optional ? " · optional" : ""}`}</small>
              <h2>{step.title}</h2>
              <p>{step.why}</p>
            </div>
            <span className={`badge ${step.done ? "" : step.optional ? "" : "warn"}`}>{step.done ? "Done" : step.optional ? "Optional" : "To do"}</span>
          </div>
          {step.done && step.detail ? (
            <div className="wizard-done-note">
              <Icon name="check" className="sm" />
              {`Already set: ${step.detail}.`}
            </div>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
          <div className="wizard-body">
            <StepBody step={step.key} s={s} busy={busy} run={run} setProgress={setProgress} />
            {progress ? <p className="muted small" style={{ marginTop: 8 }}>{progress}</p> : null}
          </div>
          <div className="wizard-foot">
            <button type="button" className="btn" disabled={at === 0 || busy} onClick={() => go(at - 1)}>
              Back
            </button>
            <span style={{ flex: 1 }} />
            {step.done ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => go(at + 1)}>
                {at === s.steps.length - 1 ? "Finish" : "Next step"}
                <Icon name="arrow" className="sm" />
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => go(at + 1)}>
                {step.optional ? "Skip, do it later" : "Skip for now"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FinishCard({ s, go }: { s: Ctx; go: (i: number) => void }) {
  const left = s.steps.map((x, i) => ({ ...x, i })).filter((x) => !x.done && !x.optional);
  return (
    <div className="panel wizard-card">
      <div className="wizard-card-head">
        <div>
          <h2>{left.length ? "Almost there" : "Your school is set up"}</h2>
          <p>{left.length ? "These essential steps are still open. Pick one to finish it." : "Everything essential is in place. Teachers, parents and students can sign in and the school can start its year."}</p>
        </div>
      </div>
      <ul className="wizard-summary">
        {s.steps.map((x, i) => (
          <li key={x.key} className={x.done ? "done" : ""}>
            <span className="setup-num">{x.done ? <Icon name="check" className="sm" /> : i + 1}</span>
            <span style={{ flex: 1 }}>
              <strong>{x.title}</strong>
              <small>{x.done ? x.detail ?? "Done" : x.optional ? "Optional, not set up" : "Not done yet"}</small>
            </span>
            {!x.done ? (
              <button type="button" className="btn sm" onClick={() => go(i)}>
                {x.optional ? "Set up" : "Finish this"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="wizard-foot">
        <button type="button" className="btn" onClick={() => go(s.steps.length - 1)}>
          Back
        </button>
        <span style={{ flex: 1 }} />
        <Link href={routeOf(33)} className="btn primary">
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}

type Ctx = ReturnType<typeof useSetupStatus>;
type Run = (label: string, fn: () => Promise<void>, stay?: boolean) => Promise<void>;
type StepProps = { s: Ctx; busy: boolean; run: Run; setProgress: (t: string | null) => void };

function GoTo({ n, label, primary = true }: { n: number; label: string; primary?: boolean }) {
  return (
    <Link href={routeOf(n)} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name="arrow" className="sm" />
      {label}
    </Link>
  );
}

function StepBody({ step, ...p }: StepProps & { step: string }) {
  const { s, busy, run } = p;
  switch (step) {
    case "profile":
      return <ProfileStep {...p} />;
    case "year":
      return <YearStep {...p} />;
    case "classes":
      return <ClassesStep {...p} />;
    case "subjects":
      return <SubjectsStep {...p} />;
    case "periods":
      return <PeriodsStep {...p} />;
    case "grading":
      return s.steps.find((x) => x.key === "grading")?.done ? (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>A default grading scale is in place.</p>
          <GoTo n={149} label="Review the grading scale" primary={false} />
        </div>
      ) : (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Use the CBSE 8-point scale (A1 to E) as the school’s default. You can edit it or add your own later.</p>
          <GoTo n={149} label="Make my own" primary={false} />
          <button type="button" className="btn primary" disabled={busy} onClick={() => run("CBSE grading scale added.", async () => void (await api.post("/api/v1/school/grade-scales/seed-cbse")))}>
            <Icon name="check" className="sm" />
            Use the CBSE scale
          </button>
        </div>
      );
    case "staff":
      return <StaffStep {...p} />;
    case "fees":
      return <FeesStep {...p} />;
    case "students":
      return <StudentsStep {...p} />;
    case "payments":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Enter your Razorpay keys so parents can pay fees online. You can collect fees at the counter without it.</p>
          <GoTo n={1043} label="Set up online payments" />
        </div>
      );
    case "whatsapp":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Connect your WhatsApp Business number to reach parents on WhatsApp. Notices always reach the app without it.</p>
          <GoTo n={1082} label="Connect WhatsApp" />
        </div>
      );
    default:
      return null;
  }
}

function ProfileStep({ s, busy, run }: StepProps) {
  const p = s.profile;
  const [f, setF] = useState({
    name: p?.name ?? "",
    principal_name: p?.principal_name ?? "",
    address: p?.address ?? "",
    phone_primary: p?.phone_primary ?? "",
    email: p?.email ?? "",
    board: p?.board ?? "",
    timezone: p?.timezone ?? "Asia/Kolkata",
    school_start_time: p?.school_start_time?.slice(0, 5) ?? "",
    school_end_time: p?.school_end_time?.slice(0, 5) ?? "",
  });
  const [days, setDays] = useState<string[]>(() => (p?.working_days || "MON,TUE,WED,THU,FRI,SAT").split(",").map((x) => x.trim().toUpperCase()));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ready = f.name.trim().length >= 2 && f.address.trim() && f.phone_primary.trim() && f.email.trim() && days.length;
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>School name</span>
          <input value={f.name} onChange={set("name")} />
        </label>
        <label className="field">
          <span>Principal</span>
          <input value={f.principal_name} onChange={set("principal_name")} placeholder="Name of the principal" />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span>Address *</span>
          <textarea rows={2} value={f.address} onChange={set("address")} placeholder="Street, area, city, PIN" />
        </label>
        <label className="field">
          <span>Phone *</span>
          <input value={f.phone_primary} onChange={set("phone_primary")} placeholder="Office phone" />
        </label>
        <label className="field">
          <span>Email *</span>
          <input type="email" value={f.email} onChange={set("email")} placeholder="office@school.edu" />
        </label>
        <label className="field">
          <span>Board</span>
          <select value={f.board} onChange={set("board")}>
            <option value="">Choose…</option>
            {["CBSE", "ICSE", "State Board", "IB", "Cambridge (IGCSE)", "Other"].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>School code</span>
          <input value={p?.code ?? ""} readOnly />
        </label>
        <label className="field">
          <span>Timezone</span>
          <input value={f.timezone} onChange={set("timezone")} placeholder="Asia/Kolkata" />
        </label>
        <label className="field">
          <span>School starts</span>
          <input type="time" value={f.school_start_time} onChange={set("school_start_time")} />
        </label>
        <label className="field">
          <span>School ends</span>
          <input type="time" value={f.school_end_time} onChange={set("school_end_time")} />
        </label>
      </div>
      <p className="muted small" style={{ margin: "12px 0 6px" }}>Working days</p>
      <div className="setup-chips">
        {WEEKDAYS.map((d) => (
          <label key={d} className="setup-chip">
            <input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays((xs) => (e.target.checked ? WEEKDAYS.filter((w) => w === d || xs.includes(w)) : xs.filter((x) => x !== d)))} />
            {d.charAt(0) + d.slice(1).toLowerCase()}
          </label>
        ))}
      </div>
      <div className="wizard-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !ready}
          onClick={() =>
            run("School details saved.", async () => {
              await api.patch("/api/v1/school/profile", {
                name: f.name.trim(),
                principal_name: f.principal_name.trim() || null,
                address: f.address.trim(),
                phone_primary: f.phone_primary.trim(),
                email: f.email.trim(),
                board: f.board || null,
                timezone: f.timezone.trim() || "Asia/Kolkata",
                school_start_time: f.school_start_time || null,
                school_end_time: f.school_end_time || null,
                working_days: days.join(","),
              });
            })
          }
        >
          <Icon name="check" className="sm" />
          Save and continue
        </button>
      </div>
    </>
  );
}

type StaffRow = { id: number; full_name: string; email: string | null; role: string; employee_no: string };

function StaffStep({ busy, run }: StepProps) {
  const list = useApi<StaffRow[]>("/api/v1/school/staff");
  const staff = list.data ?? [];
  const suggested = useApi<{ employee_no: string }>("/api/v1/school/staff/next-employee-no");
  const blank = { full_name: "", email: "", phone: "", role: "teacher", designation: "", employee_no: "" };
  const [f, setF] = useState(blank);
  const [made, setMade] = useState<{ name: string; email: string; password: string }[]>([]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ready = f.full_name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email);
  return (
    <>
      {made.length ? (
        <div className="wizard-passwords">
          <strong>Logins created. Note these temporary passwords now; they are shown only once.</strong>
          {made.map((m) => (
            <div key={m.email}>
              {`${m.name} · ${m.email} · `}
              <code>{m.password}</code>
            </div>
          ))}
        </div>
      ) : null}
      {staff.length ? (
        <p className="muted small" style={{ marginBottom: 10 }}>{`Staff so far: ${staff.map((x) => `${x.full_name} (${x.role})`).join(", ")}`}</p>
      ) : (
        <p className="muted small" style={{ marginBottom: 10 }}>Add at least the principal and one teacher. Each person gets their own login.</p>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Full name *</span>
          <input value={f.full_name} onChange={set("full_name")} />
        </label>
        <label className="field">
          <span>Email (their login) *</span>
          <input type="email" value={f.email} onChange={set("email")} />
        </label>
        <label className="field">
          <span>Mobile</span>
          <input value={f.phone} onChange={set("phone")} />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={f.role} onChange={set("role")}>
            <option value="teacher">Teacher</option>
            <option value="principal">Principal</option>
            <option value="accountant">Accountant</option>
            <option value="staff">Office / other staff</option>
          </select>
        </label>
        <label className="field">
          <span>Designation</span>
          <input value={f.designation} onChange={set("designation")} placeholder="e.g. Maths teacher" />
        </label>
        <label className="field">
          <span>Employee no.</span>
          <input value={f.employee_no} onChange={set("employee_no")} placeholder={`${suggested.data?.employee_no ?? "EMP0001"} (automatic)`} />
        </label>
      </div>
      <div className="wizard-actions">
        <GoTo n={81} label="Open the staff screen" primary={false} />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !ready}
          onClick={() =>
            run(
              `${f.full_name.trim()} added.`,
              async () => {
                const r = await api.post<{ temporary_password: string }>("/api/v1/school/staff", {
                  full_name: f.full_name.trim(),
                  email: f.email.trim(),
                  phone: f.phone.trim() || null,
                  role: f.role,
                  designation: f.designation.trim() || null,
                  employee_no: f.employee_no.trim() || null,
                });
                setMade((xs) => [...xs, { name: f.full_name.trim(), email: f.email.trim(), password: r.temporary_password }]);
                setF(blank);
                list.reload();
                suggested.reload();
              },
              true,
            )
          }
        >
          <Icon name="plus" className="sm" />
          Add this person
        </button>
      </div>
    </>
  );
}

const FEE_PRESETS: { name: string; code: string; recurring: boolean; on: boolean }[] = [
  { name: "Tuition Fee", code: "TUI", recurring: true, on: true },
  { name: "Admission Fee", code: "ADM", recurring: false, on: true },
  { name: "Annual Fee", code: "ANN", recurring: false, on: false },
  { name: "Exam Fee", code: "EXM", recurring: false, on: false },
  { name: "Books & Uniform", code: "BKU", recurring: false, on: false },
  { name: "Transport Fee", code: "TRN", recurring: true, on: false },
];

function FeesStep({ s, busy, run, setProgress }: StepProps) {
  const heads = useApi<{ id: number; name: string; code: string; is_active: boolean }[]>("/api/v1/school/fees/heads");
  const structs = useApi<{ class_id: number; fee_head_id: number }[]>(s.current ? "/api/v1/school/fees/structures" : null, { academic_year_id: s.current?.id });
  const [picked, setPicked] = useState<string[]>(() => FEE_PRESETS.filter((x) => x.on).map((x) => x.name));
  // amounts[head name][class id], the first column fills the rest
  const [amounts, setAmounts] = useState<Record<string, Record<number, string>>>({});
  const [due, setDue] = useState(10);
  if (!s.current || !s.classes.length) return <p className="muted">Create the academic year and classes first (steps 2 and 3); fees are set per class.</p>;
  const existingHeads = heads.data ?? [];
  const allNames = [...new Set([...FEE_PRESETS.map((x) => x.name), ...existingHeads.map((h) => h.name)])];
  const has = new Set((structs.data ?? []).map((x) => `${x.class_id}:${x.fee_head_id}`));
  const headId = (name: string) => existingHeads.find((h) => h.name.toLowerCase() === name.toLowerCase())?.id;
  const amt = (h: string, c: number) => amounts[h]?.[c] ?? "";
  const setAmt = (h: string, c: number, v: string) => setAmounts((a) => ({ ...a, [h]: { ...(a[h] ?? {}), [c]: v } }));
  const fillDown = (h: string) => {
    const first = amt(h, s.classes[0].id);
    setAmounts((a) => ({ ...a, [h]: Object.fromEntries(s.classes.map((c) => [c.id, first])) }));
  };
  const cells = picked.flatMap((h) => s.classes.map((c) => ({ h, c, v: Number(amt(h, c.id)) }))).filter((x) => x.v > 0 && !(headId(x.h) && has.has(`${x.c.id}:${headId(x.h)}`)));
  return (
    <>
      <p className="muted small" style={{ marginBottom: 8 }}>1. Tick what the school charges.</p>
      <div className="setup-chips">
        {allNames.map((n) => (
          <label key={n} className="setup-chip">
            <input type="checkbox" checked={picked.includes(n)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, n] : xs.filter((x) => x !== n)))} />
            {n}
            {FEE_PRESETS.find((x) => x.name === n)?.recurring ? <small className="muted">monthly</small> : null}
          </label>
        ))}
      </div>
      {picked.length ? (
        <>
          <p className="muted small" style={{ margin: "14px 0 8px" }}>2. Enter the amount for each class (₹). Type the first one and use “Same for all” to copy it down.</p>
          <div className="table-wrap">
            <table className="data-table wizard-fee-table">
              <thead>
                <tr>
                  <th>Class</th>
                  {picked.map((h) => (
                    <th key={h}>
                      {h}
                      <button type="button" className="link-btn" onClick={() => fillDown(h)}>
                        Same for all
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.classes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    {picked.map((h) => {
                      const set = headId(h) && has.has(`${c.id}:${headId(h)}`);
                      return (
                        <td key={h}>
                          {set ? (
                            <span className="muted small">Already set</span>
                          ) : (
                            <input type="number" min={0} inputMode="numeric" aria-label={`${h} for ${c.name}`} value={amt(h, c.id)} onChange={(e) => setAmt(h, c.id, e.target.value)} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="field" style={{ maxWidth: 220, marginTop: 12 }}>
            <span>Due on day of the month</span>
            <input type="number" min={1} max={28} value={due} onChange={(e) => setDue(Math.max(1, Math.min(28, Number(e.target.value) || 10)))} />
          </label>
        </>
      ) : null}
      <div className="wizard-actions">
        <GoTo n={155} label="Open the full fee screen" primary={false} />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !cells.length}
          onClick={() =>
            run("Fees saved for the classes.", async () => {
              const ids: Record<string, number> = {};
              const codes = new Set(existingHeads.map((h) => h.code.toUpperCase()));
              for (const h of picked) {
                const id = headId(h);
                if (id) {
                  ids[h] = id;
                  continue;
                }
                if (!cells.some((x) => x.h === h)) continue;
                setProgress(`Adding the fee “${h}”…`);
                const preset = FEE_PRESETS.find((x) => x.name === h);
                let code = preset?.code ?? subjectCode(h, new Set());
                for (let i = 2; codes.has(code); i++) code = `${preset?.code ?? "FEE"}${i}`;
                codes.add(code);
                const made = await api.post<{ id: number }>("/api/v1/school/fees/heads", { name: h, code, is_recurring: preset?.recurring ?? false });
                ids[h] = made.id;
              }
              for (const [i, x] of cells.entries()) {
                setProgress(`Saving ${x.h} for ${x.c.name} (${i + 1} of ${cells.length})…`);
                await api.post("/api/v1/school/fees/structures", { academic_year_id: s.current!.id, class_id: x.c.id, fee_head_id: ids[x.h], amount: x.v, due_day_of_month: due });
              }
            })
          }
        >
          <Icon name="check" className="sm" />
          {cells.length ? `Save ${cells.length} fee amount${cells.length === 1 ? "" : "s"}` : "Enter amounts to save"}
        </button>
      </div>
    </>
  );
}

function StudentsStep({ s, busy, run }: StepProps) {
  const sections = s.classes.flatMap((c) => c.sections.map((x) => ({ id: x.id, label: `${c.name} ${x.name}` })));
  const blank = { full_name: "", gender: "", dob: "", section_id: "", parent_name: "", parent_email: "", parent_phone: "", relation: "father" };
  const [f, setF] = useState(blank);
  const [made, setMade] = useState<{ student: string; parent?: string; email?: string; password?: string }[]>([]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  if (!s.current || !sections.length) return <p className="muted">Create the academic year and classes with sections first; each student joins a section.</p>;
  const section = f.section_id || String(sections[0].id);
  const parentOk = !f.parent_email.trim() || (/\S+@\S+\.\S+/.test(f.parent_email) && f.parent_name.trim().length >= 2);
  const ready = f.full_name.trim().length >= 2 && parentOk;
  return (
    <>
      {made.length ? (
        <div className="wizard-passwords">
          <strong>Added. Parent logins show their temporary password only once; note it now.</strong>
          {made.map((m, i) => (
            <div key={i}>
              {m.student}
              {m.parent ? (
                <>
                  {` · parent ${m.parent} (${m.email}) · `}
                  <code>{m.password}</code>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="muted small" style={{ marginBottom: 10 }}>
        {s.steps.find((x) => x.key === "students")?.done ? "Add more here, or import the rest from a spreadsheet." : "Add a few here, or import the whole school from a spreadsheet."}
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Student’s full name *</span>
          <input value={f.full_name} onChange={set("full_name")} />
        </label>
        <label className="field">
          <span>Class and section</span>
          <select value={section} onChange={set("section_id")}>
            {sections.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Gender</span>
          <select value={f.gender} onChange={set("gender")}>
            <option value="">—</option>
            <option value="male">Boy</option>
            <option value="female">Girl</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field">
          <span>Date of birth</span>
          <input type="date" value={f.dob} onChange={set("dob")} />
        </label>
        <label className="field">
          <span>Parent’s name</span>
          <input value={f.parent_name} onChange={set("parent_name")} />
        </label>
        <label className="field">
          <span>Parent’s email (their login)</span>
          <input type="email" value={f.parent_email} onChange={set("parent_email")} placeholder="Leave empty to add later" />
        </label>
        <label className="field">
          <span>Parent’s mobile</span>
          <input value={f.parent_phone} onChange={set("parent_phone")} />
        </label>
        <label className="field">
          <span>Relation</span>
          <select value={f.relation} onChange={set("relation")}>
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="guardian">Guardian</option>
          </select>
        </label>
      </div>
      <div className="wizard-actions">
        <GoTo n={1010} label="Import from a spreadsheet" primary={false} />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !ready}
          onClick={() =>
            run(
              `${f.full_name.trim()} added.`,
              async () => {
                const st = await api.post<{ id: number }>("/api/v1/school/students", {
                  full_name: f.full_name.trim(),
                  gender: f.gender || null,
                  dob: f.dob || null,
                  academic_year_id: s.current!.id,
                  section_id: Number(section),
                });
                const row: (typeof made)[number] = { student: f.full_name.trim() };
                if (f.parent_email.trim()) {
                  try {
                    const pr = await api.post<{ temporary_password: string }>("/api/v1/school/parents", {
                      full_name: f.parent_name.trim(),
                      email: f.parent_email.trim(),
                      phone: f.parent_phone.trim() || null,
                      student_id: st.id,
                      relation: f.relation,
                    });
                    Object.assign(row, { parent: f.parent_name.trim(), email: f.parent_email.trim(), password: pr.temporary_password });
                  } catch (err) {
                    // the student is in; don't let a retry add them twice
                    setMade((xs) => [...xs, row]);
                    setF({ ...blank, section_id: section });
                    throw new Error(`${row.student} was added, but the parent login was not: ${errorText(err)} Add the parent from the student’s page.`);
                  }
                }
                setMade((xs) => [...xs, row]);
                setF({ ...blank, section_id: section });
              },
              true,
            )
          }
        >
          <Icon name="plus" className="sm" />
          Add this student
        </button>
      </div>
    </>
  );
}

function YearStep({ s, busy, run }: StepProps) {
  const d = useMemo(defaultYear, []);
  const [name, setName] = useState(s.current?.name ?? d.name);
  const [start, setStart] = useState(s.current?.start_date ?? d.start);
  const [end, setEnd] = useState(s.current?.end_date ?? d.end);
  const [n, setN] = useState(2);
  const preview = start && end && start < end ? splitTerms(start, end, n) : [];
  if (s.steps.find((x) => x.key === "year")?.done)
    return (
      <div className="row">
        <p className="muted" style={{ flex: 1 }}>The year and its terms are in place. Dates can be changed on the Terms screen.</p>
        <GoTo n={93} label="Edit terms" primary={false} />
      </div>
    );
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>Year name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={Boolean(s.current)} />
        </label>
        <label className="field">
          <span>Split into</span>
          <select value={n} onChange={(e) => setN(Number(e.target.value))}>
            <option value={1}>One term (the whole year)</option>
            <option value={2}>2 semesters</option>
            <option value={3}>3 terms</option>
            <option value={4}>4 quarters</option>
          </select>
        </label>
        <label className="field">
          <span>Starts</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={Boolean(s.current)} />
        </label>
        <label className="field">
          <span>Ends</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={Boolean(s.current)} />
        </label>
      </div>
      {preview.length ? <p className="muted small" style={{ margin: "10px 0" }}>{preview.map((t) => `${t.name}: ${t.start_date} to ${t.end_date}`).join(" · ")}</p> : null}
      <button
        type="button"
        className="btn primary"
        disabled={busy || !preview.length || !name.trim()}
        onClick={() =>
          run(s.current ? "Terms added." : `${name} created as the current year, with its terms.`, async () => {
            let yearId = s.current?.id;
            if (!yearId) {
              const y = await api.post<{ id: number }>("/api/v1/school/academic-years", { name: name.trim(), start_date: start, end_date: end, is_current: true });
              yearId = y.id;
            }
            for (const t of preview) await api.post(`/api/v1/school/academic-years/${yearId}/terms`, t);
            window.dispatchEvent(new Event("bc:years-changed"));
          })
        }
      >
        <Icon name="check" className="sm" />
        {s.current ? "Add these terms" : "Create the year and its terms"}
      </button>
    </>
  );
}

function ClassesStep({ s, busy, run, setProgress }: StepProps) {
  const existing = new Set(s.classes.map((c) => c.name.toLowerCase()));
  const [picked, setPicked] = useState<string[]>(() => CLASS_PRESETS.filter((c) => /^Grade ([1-9]|10)$/.test(c)));
  const [sections, setSections] = useState("A");
  const [capacity, setCapacity] = useState(40);
  const secList = [...new Set(sections.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))];
  const todo = CLASS_PRESETS.filter((c) => picked.includes(c) && !existing.has(c.toLowerCase()));
  if (!s.current) return <p className="muted">Create the academic year first (step 2); classes belong to it.</p>;
  return (
    <>
      <p className="muted small" style={{ marginBottom: 8 }}>Tick the classes the school runs. Classes that already exist are left alone.</p>
      <div className="setup-chips">
        {CLASS_PRESETS.map((c) => {
          const has = existing.has(c.toLowerCase());
          return (
            <label key={c} className={`setup-chip ${has ? "has" : ""}`}>
              <input type="checkbox" disabled={has} checked={has || picked.includes(c)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, c] : xs.filter((x) => x !== c)))} />
              {c}
            </label>
          );
        })}
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Sections in each class</span>
          <input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="A, B, C" />
        </label>
        <label className="field">
          <span>Students per section</span>
          <input type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 40)} />
        </label>
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ marginTop: 10 }}
        disabled={busy || !todo.length || !secList.length}
        onClick={() =>
          run(`${todo.length} classes created with sections ${secList.join(", ")}.`, async () => {
            let order = s.classes.length;
            for (const [i, name] of todo.entries()) {
              setProgress(`Creating ${name} (${i + 1} of ${todo.length})…`);
              const c = await api.post<{ id: number }>("/api/v1/school/classes", { academic_year_id: s.current!.id, name, display_order: order++ });
              for (const sec of secList) await api.post(`/api/v1/school/classes/${c.id}/sections`, { name: sec, capacity });
            }
          })
        }
      >
        <Icon name="check" className="sm" />
        {todo.length ? `Create ${todo.length} classes × ${secList.length} section${secList.length === 1 ? "" : "s"}` : "Nothing new to create"}
      </button>
      <span style={{ marginLeft: 10 }}>
        <GoTo n={94} label="Edit classes one by one" primary={false} />
      </span>
    </>
  );
}

function SubjectsStep({ s, busy, run, setProgress }: StepProps) {
  const have = new Map(s.subjects.map((x) => [x.name.toLowerCase(), x]));
  const [picked, setPicked] = useState<string[]>(() => SUBJECT_PRESETS.filter(([, on]) => on).map(([n]) => n));
  const [extra, setExtra] = useState("");
  const names = [...new Set([...picked, ...extra.split(",").map((x) => x.trim()).filter(Boolean)])];
  if (!s.classes.length) return <p className="muted">Create the classes first (step 3); subjects are added to every class.</p>;
  return (
    <>
      <p className="muted small" style={{ marginBottom: 8 }}>Tick the subjects taught. They are added to every class; take a subject off a class later on the Subjects screen.</p>
      <div className="setup-chips">
        {SUBJECT_PRESETS.map(([n]) => (
          <label key={n} className={`setup-chip ${have.has(n.toLowerCase()) ? "has" : ""}`}>
            <input type="checkbox" checked={picked.includes(n) || have.has(n.toLowerCase())} disabled={have.has(n.toLowerCase())} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, n] : xs.filter((x) => x !== n)))} />
            {n}
          </label>
        ))}
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Other subjects (comma separated)</span>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. French, Yoga" />
      </label>
      <button
        type="button"
        className="btn primary"
        style={{ marginTop: 10 }}
        disabled={busy || !names.length}
        onClick={() =>
          run(`Subjects added to all ${s.classes.length} classes.`, async () => {
            const taken = new Set(s.subjects.map((x) => x.code.toUpperCase()));
            const fresh = names.filter((n) => !have.has(n.toLowerCase()));
            if (fresh.length) {
              setProgress("Creating subjects…");
              await api.post("/api/v1/school/subjects/bulk", { subjects: fresh.map((name, i) => ({ name, code: subjectCode(name, taken), display_order: s.subjects.length + i })) });
            }
            const all = await api.get<{ id: number; name: string }[]>("/api/v1/school/subjects");
            const wanted = all.filter((x) => names.some((n) => n.toLowerCase() === x.name.toLowerCase()));
            for (const [i, c] of s.classes.entries()) {
              setProgress(`Adding subjects to ${c.name} (${i + 1} of ${s.classes.length})…`);
              const already = new Set((await api.get<{ subject_id: number }[]>(`/api/v1/school/classes/${c.id}/subjects`)).map((x) => x.subject_id));
              for (const subj of wanted) if (!already.has(subj.id)) await api.post(`/api/v1/school/classes/${c.id}/subjects`, { subject_id: subj.id });
            }
          })
        }
      >
        <Icon name="check" className="sm" />
        {`Add ${names.length} subjects to all ${s.classes.length} classes`}
      </button>
    </>
  );
}

function PeriodsStep({ s, busy, run, setProgress }: StepProps) {
  const [start, setStart] = useState("09:00");
  const [count, setCount] = useState(8);
  const [length, setLength] = useState(40);
  const [breakAfter, setBreakAfter] = useState(4);
  const [breakLen, setBreakLen] = useState(30);
  const days = (s.profile?.working_days || "MON,TUE,WED,THU,FRI,SAT").split(",").map((x) => x.trim().toUpperCase()).filter((x) => WEEKDAYS.includes(x));
  const plan: { period_number: number; start_time: string; end_time: string; label: string; is_break: boolean }[] = [];
  let t = toMins(start || "09:00");
  let num = 1;
  for (let i = 1; i <= count; i++) {
    plan.push({ period_number: num++, start_time: hm(t), end_time: hm(t + length), label: `Period ${i}`, is_break: false });
    t += length;
    if (i === breakAfter && breakLen > 0 && i < count) {
      plan.push({ period_number: num++, start_time: hm(t), end_time: hm(t + breakLen), label: "Break", is_break: true });
      t += breakLen;
    }
  }
  if (s.steps.find((x) => x.key === "periods")?.done)
    return (
      <div className="row">
        <p className="muted" style={{ flex: 1 }}>The school day’s periods are in place.</p>
        <GoTo n={122} label="Edit periods" primary={false} />
      </div>
    );
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>First period starts</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Periods a day</span>
          <input type="number" min={1} max={12} value={count} onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span>Minutes per period</span>
          <input type="number" min={15} max={120} value={length} onChange={(e) => setLength(Math.max(15, Number(e.target.value) || 40))} />
        </label>
        <label className="field">
          <span>Break after period</span>
          <input type="number" min={0} max={12} value={breakAfter} onChange={(e) => setBreakAfter(Number(e.target.value) || 0)} />
        </label>
        <label className="field">
          <span>Break minutes</span>
          <input type="number" min={0} max={90} value={breakLen} onChange={(e) => setBreakLen(Number(e.target.value) || 0)} />
        </label>
      </div>
      <p className="muted small" style={{ margin: "10px 0" }}>
        {`${days.length} working day(s): ${days.join(", ")} · ${plan.map((p) => `${p.label} ${p.start_time}–${p.end_time}`).join(" · ")}`}
      </p>
      <button
        type="button"
        className="btn primary"
        disabled={busy || !days.length}
        onClick={() =>
          run("The school day is set up.", async () => {
            for (const [i, day] of days.entries()) {
              setProgress(`Setting up ${day} (${i + 1} of ${days.length})…`);
              for (const p of plan) await api.post("/api/v1/school/periods", { ...p, day_of_week: WEEKDAYS.indexOf(day) + 1 });
            }
          })
        }
      >
        <Icon name="check" className="sm" />
        Create this day for every working day
      </button>
      <span style={{ marginLeft: 10 }}>
        <GoTo n={122} label="Edit periods one by one" primary={false} />
      </span>
    </>
  );
}
