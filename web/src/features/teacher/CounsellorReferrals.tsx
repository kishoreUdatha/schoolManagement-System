"use client";

/*
 * NEW-108, live: a teacher refers a child they are worried about to the
 * counsellor, and follows where their referrals stand (never the notes).
 * POST/GET /api/v1/school/discipline/counselling/cases — a teacher sees
 * their own referrals unless the case is marked sensitive.
 */

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { StudentPicker, type PickedStudent } from "@/features/transport/kit";

const CASES = "/api/v1/school/discipline/counselling/cases";
const CATEGORY: Record<string, string> = {
  emotional: "Emotional wellbeing", behaviour: "Behaviour", peer_relations: "Friendships", bullying: "Bullying", family: "Family",
  academic: "Studies", health: "Health", career: "Career", other: "Something else",
};
type Case = { id: number; reference_no: string; student_name: string; section_label: string | null; title: string; priority: string; status: string; opened_on: string; counsellor_name: string | null; closed_on: string | null };

export function CounsellorReferrals() {
  const params = useSearchParams();
  const pre = params.get("student");
  const list = useApi<Case[]>(CASES);
  const [student, setStudent] = useState<PickedStudent | null>(pre ? { id: Number(pre), full_name: params.get("name") ?? "", admission_no: "" } : null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("emotional");
  const [concern, setConcern] = useState("");
  const [priority, setPriority] = useState("medium");
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refer(e: FormEvent) {
    e.preventDefault();
    if (!student) return setError("Choose the student.");
    setBusy(true);
    setError(null);
    try {
      await api.post(CASES, { student_id: student.id, title: title.trim(), category, concern: concern.trim(), priority, is_sensitive: sensitive });
      notify("Referred. The counsellor has been told.");
      setStudent(null);
      setTitle("");
      setConcern("");
      setPriority("medium");
      setSensitive(false);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = list.data ?? [];
  return (
    <>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="Refer a student" sub="What you have noticed goes to the counsellor; the session notes stay with them">
        <form onSubmit={refer}>
          <div className="form-grid">
            <div>
              <StudentPicker value={student} onChange={setStudent} required />
            </div>
            <label className="field">
              <span>In a few words</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} placeholder="e.g. Withdrawn in class" />
            </label>
            <label className="field">
              <span>About</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(CATEGORY).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>How urgent</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Can wait</option>
                <option value="medium">Soon</option>
                <option value="high">Urgent: the principal is told too</option>
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>
            <span>What you have noticed</span>
            <textarea rows={4} value={concern} onChange={(e) => setConcern(e.target.value)} required minLength={5} maxLength={5000} />
          </label>
          <div className="filterbar" style={{ marginTop: 8 }}>
            <label className="check" style={{ flex: 1 }}>
              <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
              <span>Sensitive: after referring, I won&apos;t see this case</span>
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Referring…" : "Refer to the counsellor"}
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="My referrals" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Concern</th>
                <th>Referred</th>
                <th>Counsellor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.student_name}
                    <small className="muted" style={{ display: "block" }}>{c.section_label ?? ""}</small>
                  </td>
                  <td className="wrap">{c.title}</td>
                  <td>{date(c.opened_on)}</td>
                  <td>{c.counsellor_name ?? "Not yet assigned"}</td>
                  <td>{c.status === "closed" ? `Closed ${c.closed_on ? date(c.closed_on) : ""}` : "Open"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="table-empty">{list.loading ? "Loading…" : "You haven't referred anyone."}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
