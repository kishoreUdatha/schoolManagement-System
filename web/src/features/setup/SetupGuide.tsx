"use client";

/*
 * NEW-084 · Setup guide. Everything a new school has to set up, in order, on
 * one page: each step ticks itself off from the school's real data, and the
 * common ones are done here in one go with sensible defaults (the year and
 * its terms, classes with their sections, subjects for every class, the
 * day's periods, the CBSE grading scale). Steps that need the school's own
 * details (staff, fees, students, payments, WhatsApp) link to their screen.
 *
 * Reads: /profile, /academic-years (+ /terms), /classes, /subjects,
 * /classes/{id}/subjects, /periods, /grade-scales, /staff, /fees/structures,
 * /students, /payments/gateway, /whatsapp. Writes go through the same
 * endpoints the screens use, so the same checks apply.
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
type Profile = { address: string | null; phone_primary: string | null; email: string | null; working_days: string; logo_url: string | null };
type Paged = { total: number };

export type SetupStep = { key: string; title: string; why: string; done: boolean; optional?: boolean; detail?: string };

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
    { key: "profile", title: "School details", why: "Address, phone and email appear on receipts, report cards and certificates.", done: Boolean(p?.address && p?.phone_primary && p?.email) },
    { key: "year", title: "Academic year and terms", why: "Classes, attendance, fees and exams all belong to the current year.", done: Boolean(current && (terms.data?.length ?? 0) > 0), detail: current ? `${current.name}${terms.data ? ` · ${terms.data.length} term(s)` : ""}` : undefined },
    { key: "classes", title: "Classes and sections", why: "Students are admitted into a section of a class.", done: cls.length > 0 && cls.every((c) => c.sections.length > 0), detail: cls.length ? `${cls.length} classes · ${cls.reduce((n, c) => n + c.sections.length, 0)} sections` : undefined },
    { key: "subjects", title: "Subjects", why: "Needed for the timetable, homework, marks and report cards.", done: (subjects.data?.length ?? 0) > 0 && (taught.data?.length ?? 0) > 0, detail: subjects.data?.length ? `${subjects.data.length} subjects` : undefined },
    { key: "periods", title: "School day (periods)", why: "The timetable is built on these periods.", done: (periods.data?.length ?? 0) > 0 },
    { key: "grading", title: "Grading scale", why: "Turns marks into grades on report cards.", done: Boolean(scales.data?.some((s) => s.is_default && s.is_active)) },
    { key: "staff", title: "Staff", why: "Teachers and office staff each get their own login.", done: (staff.data?.length ?? 0) > 0, detail: staff.data?.length ? `${staff.data.length} staff` : undefined },
    { key: "fees", title: "Fees", why: "What each class pays, so fees can be raised and collected.", done: (fees.data?.length ?? 0) > 0 },
    { key: "students", title: "Students", why: "Add them one by one, import a spreadsheet, or admit them through admissions.", done: (students.data?.total ?? 0) > 0, detail: students.data?.total ? `${students.data.total} students` : undefined },
    { key: "payments", title: "Online fee payments", why: "Your Razorpay account, so parents can pay from the app.", done: Boolean(gateway.data?.configured), optional: true },
    { key: "whatsapp", title: "WhatsApp", why: "Send notices, alerts and sign-in codes on your WhatsApp number.", done: Boolean(whatsapp.data?.configured), optional: true },
  ];
  const loading = !profile.data || !years.data;
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
      <Link href={routeOf(1084)} className="btn primary">
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
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstOpen = s.steps.find((x) => !x.done)?.key ?? null;
  useEffect(() => {
    if (!s.loading && open === null) setOpen(firstOpen);
  }, [s.loading, firstOpen, open]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      await fn();
      notify(label);
      s.reload();
      setOpen(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const pct = Math.round((s.done / s.total) * 100);
  return (
    <div className="setup-guide">
      <div className="panel setup-head">
        <div>
          <h2>{s.done >= s.total ? "Your school is set up" : "Let’s set up your school"}</h2>
          <p>{s.done >= s.total ? "Everything essential is in place. The optional steps can be done any time." : "Work down the list. Most steps take a minute; the ones marked “one click” fill in sensible defaults you can change later."}</p>
        </div>
        <div className="setup-meter">
          <b>{`${s.done}/${s.total}`}</b>
          <span>{`${pct}% done`}</span>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <ol className="setup-steps">
        {s.steps.map((step, i) => {
          const isOpen = open === step.key;
          return (
            <li key={step.key} className={`setup-step ${step.done ? "done" : ""} ${isOpen ? "open" : ""}`}>
              <button type="button" className="setup-step-head" onClick={() => setOpen(isOpen ? null : step.key)} aria-expanded={isOpen}>
                <span className="setup-num">{step.done ? <Icon name="check" className="sm" /> : i + 1}</span>
                <span className="setup-title">
                  <strong>{step.title}</strong>
                  <small>{step.done && step.detail ? step.detail : step.why}</small>
                </span>
                <span className={`badge ${step.done ? "" : step.optional ? "" : "warn"}`}>{step.done ? "Done" : step.optional ? "Optional" : "To do"}</span>
              </button>
              {isOpen ? (
                <div className="setup-body">
                  <StepBody step={step.key} s={s} busy={busy} run={run} setProgress={setProgress} />
                  {progress ? <p className="muted small" style={{ marginTop: 8 }}>{progress}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Ctx = ReturnType<typeof useSetupStatus>;
type Run = (label: string, fn: () => Promise<void>) => Promise<void>;

function GoTo({ n, label, primary = true }: { n: number; label: string; primary?: boolean }) {
  return (
    <Link href={routeOf(n)} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name="arrow" className="sm" />
      {label}
    </Link>
  );
}

function StepBody({ step, s, busy, run, setProgress }: { step: string; s: Ctx; busy: boolean; run: Run; setProgress: (t: string | null) => void }) {
  switch (step) {
    case "profile":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Add the address, phone, email and logo in School Settings.</p>
          <GoTo n={289} label="Open School Settings" />
        </div>
      );
    case "year":
      return <YearStep s={s} busy={busy} run={run} />;
    case "classes":
      return <ClassesStep s={s} busy={busy} run={run} setProgress={setProgress} />;
    case "subjects":
      return <SubjectsStep s={s} busy={busy} run={run} setProgress={setProgress} />;
    case "periods":
      return <PeriodsStep s={s} busy={busy} run={run} setProgress={setProgress} />;
    case "grading":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Use the CBSE 8-point scale (A1 to E) as the school’s default. You can edit it or add your own later.</p>
          <button type="button" className="btn primary" disabled={busy} onClick={() => run("CBSE grading scale added.", async () => void (await api.post("/api/v1/school/grade-scales/seed-cbse")))}>
            <Icon name="check" className="sm" />
            One click: use the CBSE scale
          </button>
          <GoTo n={149} label="Make my own" primary={false} />
        </div>
      );
    case "staff":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Add the principal, teachers and office staff. Each one gets a login; the temporary password is shown once.</p>
          <GoTo n={81} label="Add staff" />
        </div>
      );
    case "fees":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>First name what you charge (tuition, transport…), then set the amounts for each class.</p>
          <GoTo n={1040} label="1 · Fee heads" primary={false} />
          <GoTo n={155} label="2 · Fee structure" />
        </div>
      );
    case "students":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Import everyone from a spreadsheet, or add students one at a time. Parent logins are created with them.</p>
          <GoTo n={1010} label="Import a spreadsheet" primary={false} />
          <GoTo n={56} label="Add a student" />
        </div>
      );
    case "payments":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Enter your Razorpay keys so parents can pay fees online. Optional; you can collect at the counter without it.</p>
          <GoTo n={1043} label="Set up online payments" />
        </div>
      );
    case "whatsapp":
      return (
        <div className="row">
          <p className="muted" style={{ flex: 1 }}>Connect your WhatsApp Business number to reach parents on WhatsApp. Optional; notices always reach the app.</p>
          <GoTo n={1082} label="Connect WhatsApp" />
        </div>
      );
    default:
      return null;
  }
}

function YearStep({ s, busy, run }: { s: Ctx; busy: boolean; run: Run }) {
  const d = useMemo(defaultYear, []);
  const [name, setName] = useState(s.current?.name ?? d.name);
  const [start, setStart] = useState(s.current?.start_date ?? d.start);
  const [end, setEnd] = useState(s.current?.end_date ?? d.end);
  const [n, setN] = useState(2);
  const preview = start && end && start < end ? splitTerms(start, end, n) : [];
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
          })
        }
      >
        <Icon name="check" className="sm" />
        {s.current ? "Add these terms" : "Create the year and its terms"}
      </button>
    </>
  );
}

function ClassesStep({ s, busy, run, setProgress }: { s: Ctx; busy: boolean; run: Run; setProgress: (t: string | null) => void }) {
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

function SubjectsStep({ s, busy, run, setProgress }: { s: Ctx; busy: boolean; run: Run; setProgress: (t: string | null) => void }) {
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

function PeriodsStep({ s, busy, run, setProgress }: { s: Ctx; busy: boolean; run: Run; setProgress: (t: string | null) => void }) {
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
