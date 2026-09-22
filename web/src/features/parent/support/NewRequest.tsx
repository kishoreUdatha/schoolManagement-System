"use client";

/*
 * PM-045 · New request. A request goes to:
 *  - the school office's help desk (POST /parent/me/help-tickets), the
 *    default, owned and answered by the office; or
 *  - one of the child's teachers, as a conversation about this child
 *    (POST /parent/me/conversations), with the category and subject as its
 *    first line, and any attachment on that first message
 *    (POST …/conversations/{id}/files); or
 *  - for a hostel resident, to the warden as a hostel complaint
 *    (POST …/hostel/complaints).
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { ATTACH_ACCEPT, ATTACH_RULES, filesForm } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmError, useChildPath } from "./pm";
import { ME, type Ticket } from "./services";
import type { Conversation, TeacherContact } from "./types";

const CATEGORIES = ["General enquiry", "Attendance", "Fees & payment", "Transport", "Student details", "Health record", "App access"];
const HOSTEL = "Hostel (to the warden)";
const HOSTEL_KINDS = ["maintenance", "food", "cleanliness", "security", "roommate", "other"];
const OFFICE = "office";

export function NewRequest() {
  return (
    <ChildGate>
      <Form />
    </ChildGate>
  );
}

function Form() {
  const { childId, notify, go } = useParent();
  const router = useRouter();
  const base = useChildPath();
  const teachers = useApi<TeacherContact[]>(base && `${base}/teacher-contacts`);
  const hostel = useApi<{ hostel_name: string } | null>(base && `${base}/hostel`);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [teacher, setTeacher] = useState(OFFICE);
  const [hostelKind, setHostelKind] = useState("maintenance");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toHostel = category === HOSTEL;
  const contacts = teachers.data ?? [];
  const toOffice = teacher === OFFICE;
  const teacherId = contacts.some((t) => String(t.teacher_user_id) === teacher) ? teacher : contacts[0] ? String(contacts[0].teacher_user_id) : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!base || !childId) return;
    setBusy(true);
    setErr(null);
    try {
      if (toHostel) {
        const text = subject.trim() ? `${subject.trim()}\n\n${description.trim()}` : description.trim();
        await api.post(`${base}/hostel/complaints`, { category: hostelKind, description: text });
        notify("Sent to the hostel warden.");
        go(52);
      } else if (toOffice) {
        const t = await api.post<Ticket>(`${ME}/help-tickets`, {
          student_id: childId,
          category,
          subject: subject.trim() || category,
          description: description.trim(),
        });
        notify("Sent to the school office.");
        router.push(`${parentRoute(46)}?ticket=${t.id}`);
      } else {
        if (!teacherId) throw new Error("Choose who should receive the request.");
        const head = `${category}${subject.trim() ? `: ${subject.trim()}` : ""}`;
        const c = await api.post<Conversation>(`/api/v1/parent/me/conversations`, {
          teacher_user_id: Number(teacherId),
          student_id: childId,
          body: `${head}\n\n${description.trim()}`,
        });
        if (files.length) {
          try {
            await api.upload(`/api/v1/parent/me/conversations/${c.id}/files`, filesForm(files));
          } catch (e3) {
            notify(`Request sent, but the attachment was not: ${errorText(e3)}`);
            router.push(`${parentRoute(46)}?id=${c.id}`);
            return;
          }
        }
        notify("Request sent.");
        router.push(`${parentRoute(46)}?id=${c.id}`);
      }
    } catch (e2) {
      setErr(errorText(e2));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <PmError>{err || teachers.error}</PmError>
      <label className="field">
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
          {hostel.data ? <option>{HOSTEL}</option> : null}
        </select>
      </label>
      {toHostel ? (
        <label className="field">
          Hostel issue
          <select value={hostelKind} onChange={(e) => setHostelKind(e.target.value)}>
            {HOSTEL_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field">
          Send to
          <select value={toOffice ? OFFICE : teacherId} onChange={(e) => setTeacher(e.target.value)} required>
            <option value={OFFICE}>School office (help desk)</option>
            {contacts.length === 0 && teachers.loading ? <option value="" disabled>Loading teachers…</option> : null}
            {contacts.map((t) => (
              <option key={t.teacher_user_id} value={t.teacher_user_id}>
                {t.teacher_name}
                {t.subjects.length ? ` · ${t.subjects.join(", ")}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {category === "Health record" ? (
        <p className="micro">
          You can update allergies, medication and emergency contacts yourself on{" "}
          <button type="button" className="text-button" onClick={() => go(43)}>
            Health & emergency
          </button>
          .
        </p>
      ) : null}
      <label className="field">
        Subject
        <input type="text" placeholder="Briefly describe the issue" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
      </label>
      <label className="field">
        Description
        <textarea
          rows={3}
          placeholder="Share the details the school needs"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={5}
          maxLength={1800}
        />
      </label>
      {/* Files go with a message to a teacher; office tickets and hostel complaints take none. */}
      {toHostel || toOffice ? null : (
        <label className="field">
          Attachment (optional)
          <input type="file" multiple accept={ATTACH_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          <small className="micro">{ATTACH_RULES}</small>
        </label>
      )}
      <button className="action" type="submit" disabled={busy || (!toHostel && !toOffice && !teacherId)}>
        {busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
