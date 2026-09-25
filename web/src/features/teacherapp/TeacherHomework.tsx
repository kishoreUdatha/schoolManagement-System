"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { dayLabel, MY_CLASSES, PmEmpty, PmError, PmLoading, todayIso, type MyClasses } from "./parts";

type Homework = {
  id: number;
  title: string;
  subject_name: string | null;
  class_name: string | null;
  due_date: string;
  is_past_due: boolean;
  is_closed: boolean;
  is_scheduled: boolean;
  publish_on: string | null;
};

/** TM-004. Homework I set: what is still open, then the rest. */
export function TeacherHomeworkList() {
  const { go } = useTeacherApp();
  const hw = useApi<Homework[]>("/api/v1/teacher/homework", { include_past: true, limit: 60 });
  const [tab, setTab] = useState<"open" | "past">("open");

  const list = (hw.data ?? []).filter((h) => (tab === "open" ? !h.is_past_due && !h.is_closed : h.is_past_due || h.is_closed));
  list.sort((a, b) => (tab === "open" ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date)));

  return (
    <>
      <button className="action" onClick={() => go(5)}>
        + Set homework
      </button>
      <div className="chip-row">
        <button className={tab === "open" ? "on" : ""} onClick={() => setTab("open")}>
          Open
        </button>
        <button className={tab === "past" ? "on" : ""} onClick={() => setTab("past")}>
          Past &amp; closed
        </button>
      </div>
      <PmError>{hw.error}</PmError>
      {hw.loading && !hw.data ? <PmLoading /> : null}
      {hw.data && !list.length ? <PmEmpty title={tab === "open" ? "Nothing open" : "Nothing yet"}>{tab === "open" ? "Homework you set appears here until it is due." : ""}</PmEmpty> : null}
      {list.length ? (
        <div className="panel">
          {list.map((h) => (
            <a className="item" key={h.id} href={`${routeOf(130)}?id=${h.id}`}>
              <span>
                <strong>{h.title}</strong>
                <small className="muted">{`${h.subject_name ?? ""} · ${h.class_name ?? ""} · due ${dayLabel(h.due_date)}`}</small>
                {h.is_scheduled ? <span className="status blue">{`Publishes ${h.publish_on ? dayLabel(h.publish_on) : "later"}`}</span> : null}
                {h.is_closed ? <span className="status amber">Closed</span> : null}
              </span>
              <span>›</span>
            </a>
          ))}
        </div>
      ) : null}
      <p className="micro">Tap homework to see submissions and mark them in the full workspace.</p>
    </>
  );
}

/** TM-005. Set homework for a subject I teach. */
export function TeacherNewHomework() {
  const { go, notify } = useTeacherApp();
  const mine = useApi<MyClasses>(MY_CLASSES);
  const subjects = useMemo(() => (mine.data?.subject_teacher_of ?? []).filter((s) => s.is_current_year), [mine.data]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mine.loading && !mine.data) return <PmLoading />;
  if (mine.error) return <PmError>{mine.error}</PmError>;
  if (!subjects.length) return <PmEmpty title="No subjects assigned">Homework is set per subject. Ask the office to assign your subjects.</PmEmpty>;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const max = String(f.get("max_marks") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/teacher/homework", {
        class_subject_id: Number(f.get("class_subject_id")),
        title: String(f.get("title") ?? "").trim(),
        description: String(f.get("description") ?? "").trim(),
        due_date: String(f.get("due_date")),
        max_marks: max ? Number(max) : null,
        notify_parents: f.get("notify") === "on",
      });
      notify("Homework set.");
      go(4);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        Subject and class
        <select name="class_subject_id" required defaultValue={subjects[0].class_subject_id}>
          {subjects.map((s) => (
            <option key={s.class_subject_id} value={s.class_subject_id}>
              {`${s.subject_name} · ${s.class_name}`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Title
        <input name="title" required maxLength={200} placeholder="e.g. Exercise 5.2, questions 1–10" />
      </label>
      <label className="field">
        Instructions
        <textarea name="description" required rows={4} placeholder="What students should do and how to hand it in" />
      </label>
      <label className="field">
        Due date
        <input type="date" name="due_date" required min={todayIso()} defaultValue={todayIso(1)} />
      </label>
      <label className="field">
        Marks out of (optional)
        <input type="number" name="max_marks" min={1} max={1000} inputMode="numeric" />
      </label>
      <label className="check" style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
        <input type="checkbox" name="notify" defaultChecked /> Tell parents now
      </label>
      {error ? <p className="micro bad" role="alert">{error}</p> : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Set homework"}
      </button>
    </form>
  );
}
