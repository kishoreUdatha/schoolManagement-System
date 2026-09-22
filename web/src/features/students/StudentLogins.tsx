"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { usePageAction } from "@/features/attendance/shared";
import { OneTimeSecrets } from "./OneTimeSecrets";
import { EV, type AcademicYear, type ClassLoginsCreated, type LoginCreated, type LoginStatusRow, type SchoolClass, type SchoolCode } from "./types";

import { ask } from "@/lib/dialog";
const loginState = (r: LoginStatusRow) => (!r.has_login ? "Pending setup" : r.is_active ? "Active" : "Inactive");

/**
 * NEW-011, live: GET /api/v1/school/student-logins (?class_id) lists every
 * active student and whether they can sign in; POST /student-logins/{id}
 * creates a login or resets its password, POST /student-logins/class/{id}
 * does a whole class, DELETE /student-logins/{id} switches one off.
 * Passwords come back once and are held only in this component's state.
 */
export function StudentLogins() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const yearId = (years.data?.find((y) => y.is_current) ?? years.data?.[0])?.id;
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const school = useApi<SchoolCode>("/api/v1/school/profile");
  const [classId, setClassId] = useState("");
  const [state, setState] = useState("");
  const [typed, setTyped] = useState("");
  const list = useApi<LoginStatusRow[]>("/api/v1/school/student-logins", { class_id: classId });

  const [made, setMade] = useState<LoginCreated[] | null>(null);
  const [busy, setBusy] = useState<number | "class" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<LoginStatusRow | null>(null);
  const [classDialog, setClassDialog] = useState(false);
  const [dialogClass, setDialogClass] = useState("");

  usePageAction(EV.classLogins, () => {
    setDialogClass(classId);
    setClassDialog(true);
  });

  const all = list.data ?? [];
  const q = typed.trim().toLowerCase();
  const rows = useMemo(
    () =>
      all.filter(
        (r) => (!state || loginState(r) === state) && (!q || r.student_name.toLowerCase().includes(q) || r.admission_no.toLowerCase().includes(q)),
      ),
    [all, state, q],
  );

  const withLogin = all.filter((r) => r.has_login && r.is_active).length;
  const off = all.filter((r) => r.has_login && !r.is_active).length;
  const none = all.filter((r) => !r.has_login).length;
  const never = all.filter((r) => r.has_login && r.is_active && !r.last_login_at).length;
  const stats = [
    { label: "Students", value: String(all.length), note: classId ? "In this class" : "Every active student" },
    { label: "Can sign in", value: String(withLogin), note: all.length ? `${Math.round((withLogin / all.length) * 100)}% of students` : "—" },
    { label: "Without a login", value: String(none + off), note: off ? `${off} switched off` : "Never given one" },
    { label: "Never signed in", value: String(never), note: "Have a login, not used yet" },
  ];

  const keep = (r: LoginCreated[]) => {
    // Newest first; replace any earlier slip for the same child.
    setMade((prev) => [...r, ...(prev ?? []).filter((p) => !r.some((x) => x.student_id === p.student_id))]);
  };

  async function one(r: LoginStatusRow) {
    if (r.has_login && r.is_active && !(await ask(`Make a new password for ${r.student_name}? Their current one stops working at once.`))) return;
    setBusy(r.student_id);
    setError(null);
    try {
      keep([await api.post<LoginCreated>(`/api/v1/school/student-logins/${r.student_id}`)]);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function wholeClass() {
    if (!dialogClass) return;
    setBusy("class");
    setError(null);
    try {
      const r = await api.post<ClassLoginsCreated>(`/api/v1/school/student-logins/class/${dialogClass}`);
      keep([...r.created, ...r.reset]);
      setClassDialog(false);
      notify(`${r.created.length} login(s) created, ${r.reset.length} password(s) reset.`);
      list.reload();
    } catch (e) {
      setError(errorText(e));
      setClassDialog(false);
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!revoking) return;
    const r = revoking;
    setBusy(r.student_id);
    setError(null);
    try {
      await api.delete(`/api/v1/school/student-logins/${r.student_id}`);
      setRevoking(null);
      notify(`${r.student_name} can no longer sign in.`);
      list.reload();
    } catch (e) {
      setError(errorText(e));
      setRevoking(null);
    } finally {
      setBusy(null);
    }
  }

  const code = school.data?.code;
  const table: Row[] = rows.map((r) => [
    { name: r.student_name, sub: r.admission_no },
    [r.class_name, r.section_name].filter(Boolean).join(" ") || "—",
    r.roll_no ? String(r.roll_no) : "—",
    loginState(r),
    r.has_login ? (r.last_login_at ? date(r.last_login_at) : "Never") : "—",
  ]);

  const dialogCount = dialogClass ? all.filter((r) => classes.data?.find((c) => String(c.id) === dialogClass)?.name === r.class_name) : [];
  const dialogLabel = classes.data?.find((c) => String(c.id) === dialogClass)?.name;

  return (
    <>
      <StatStrip items={stats} compact />
      {made?.length ? (
        <>
          <OneTimeSecrets
            title="Passwords to hand over"
            heading={["Admission no.", "Password"]}
            rows={made.map((m) => ({ key: String(m.student_id), name: m.student_name, sub: code ? `School code ${code}` : undefined, signIn: m.admission_no, password: m.password, tag: m.created ? "New" : "Reset" }))}
            footnote={`Student portal: school code ${code ?? "(see school profile)"}, admission number and this password. They are asked to change it on first sign-in.`}
            onDone={() => setMade(null)}
          />
          <div className="gap" />
        </>
      ) : null}
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name or admission number…" aria-label="Search students" />
        </div>
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by login" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Any login state</option>
          <option value="Active">Can sign in</option>
          <option value="Inactive">Switched off</option>
          <option value="Pending setup">No login yet</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error ?? classes.error}</ErrorNote>
      <Panel title="Student portal logins" sub={`Sign-in is school code${code ? ` ${code}` : ""} + admission number${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Class", "Roll no.", "Login status", "Last signed in"]}
          rows={table}
          selectable={false}
          actions={(i) => {
            const r = rows[i];
            return (
              <>
                <button type="button" className={`btn ${r.has_login && r.is_active ? "" : "primary"}`} disabled={busy !== null} onClick={() => one(r)}>
                  {busy === r.student_id ? "Working…" : !r.has_login ? "Create login" : r.is_active ? "New password" : "Switch on"}
                </button>
                {r.has_login && r.is_active ? (
                  <button type="button" className="btn" disabled={busy !== null} onClick={() => setRevoking(r)}>
                    Revoke
                  </button>
                ) : null}
              </>
            );
          }}
          empty={list.loading ? "Loading students…" : q || state ? "No students match these filters." : "No active students here."}
        />
      </Panel>

      <Dialog
        open={classDialog}
        title="Logins for a whole class"
        onClose={() => setClassDialog(false)}
        onSubmit={wholeClass}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setClassDialog(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!dialogClass || busy === "class"}>
              {busy === "class" ? "Creating…" : "Create passwords"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field full">
            <span>
              Class<span className="req">*</span>
            </span>
            <select value={dialogClass} onChange={(e) => setDialogClass(e.target.value)}>
              <option value="">Choose a class</option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="gap" />
        <div className="tip warn">
          <Icon name="bell" className="sm" />
          <span>
            {`Every active student in ${dialogLabel ?? "the class"} gets a new password, including those who already have a login: their current password stops working at once.${
              dialogCount.length ? ` ${dialogCount.filter((r) => r.has_login).length} of ${dialogCount.length} already have one.` : ""
            } To help a single student, use the button on their row instead.`}
          </span>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          The passwords appear once, on this page. Print or copy them before you leave it.
        </p>
      </Dialog>

      <Dialog
        open={revoking !== null}
        title="Revoke this login?"
        onClose={() => setRevoking(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setRevoking(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={revoke} disabled={busy !== null}>
              {busy !== null ? "Revoking…" : "Revoke login"}
            </button>
          </>
        }
      >
        <p>{`${revoking?.student_name ?? ""} (${revoking?.admission_no ?? ""}) will not be able to sign in. Their homework and submissions are kept, and you can switch the login back on later with a new password.`}</p>
      </Dialog>
    </>
  );
}

