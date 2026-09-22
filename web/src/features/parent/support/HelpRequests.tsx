"use client";

/*
 * PM-044 · Help & requests. Two kinds of request about the selected child:
 * questions to the school office's help desk (GET /parent/me/help-tickets,
 * owned by the office, with status) and conversations with one of the
 * child's teachers (GET /parent/me/conversations). "Contact school" shows
 * the office hours and contacts (GET /parent/me/school-contact).
 */

import Link from "next/link";
import { useParent } from "@/components/parent/ParentShell";
import { dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading } from "./pm";
import { ME, TICKET_STATUS, type SchoolContact, type Ticket } from "./services";
import type { Conversation } from "./types";

export function HelpRequests() {
  return (
    <ChildGate>
      <Requests />
    </ChildGate>
  );
}

export function ticketStatus(t: Ticket): [text: string, cls: string] {
  if (t.status === "resolved") return ["Resolved", "value good"];
  if (t.parent_unread > 0) return ["New reply", "value warning"];
  return [TICKET_STATUS[t.status], "value"];
}

export function requestStatus(c: Conversation): [text: string, cls: string] {
  if (c.is_closed) return ["Closed", "value good"];
  if (c.unread_for_viewer > 0) return ["New reply", "value warning"];
  return ["Open", "value"];
}

function Requests() {
  const { childId, go } = useParent();
  const all = useApi<Conversation[]>(`/api/v1/parent/me/conversations`);
  const tickets = useApi<Ticket[]>(`${ME}/help-tickets`, { student_id: childId });
  const contact = useApi<SchoolContact>(`${ME}/school-contact`);
  const mine = (all.data ?? []).filter((c) => c.student_id === childId);
  const office = tickets.data ?? [];
  const c = contact.data;

  return (
    <>
      <PmError>{all.error || tickets.error}</PmError>
      {(all.loading && !all.data) || (tickets.loading && !tickets.data) ? <PmLoading /> : null}
      {office.map((t) => {
        const [text, cls] = ticketStatus(t);
        return (
          <Link key={`t${t.id}`} className="item" href={`${parentRoute(46)}?ticket=${t.id}`}>
            <span>
              <strong>{t.subject}</strong>
              <small>
                School office · {t.category}
                {t.last_reply ? ` · ${t.last_reply.slice(0, 50)}${t.last_reply.length > 50 ? "…" : ""}` : ""} · Updated {dateTime(t.last_activity_at ?? t.created_at)}
              </small>
            </span>
            <span className={cls}>{text}</span>
          </Link>
        );
      })}
      {mine.map((c) => {
        const [text, cls] = requestStatus(c);
        return (
          <Link key={c.id} className="item" href={`${parentRoute(46)}?id=${c.id}`}>
            <span>
              <strong>{c.teacher_name ?? "Teacher"}</strong>
              <small>
                {c.last_message_body ? `${c.last_message_body.slice(0, 60)}${c.last_message_body.length > 60 ? "…" : ""} · ` : ""}
                Updated {dateTime(c.last_message_at ?? c.created_at)}
              </small>
            </span>
            <span className={cls}>{text}</span>
          </Link>
        );
      })}
      {all.data && tickets.data && mine.length === 0 && office.length === 0 ? (
        <PmEmpty title="No requests yet">Questions you send to the school office or your child’s teachers will appear here with their replies.</PmEmpty>
      ) : null}
      <button className="action" onClick={() => go(45)}>
        Create a request
      </button>
      <section className="section">
        <h3>Contact school</h3>
        {c && (c.office_hours || c.office_phone || c.office_email) ? (
          <div className="panel soft">
            <span className="eyebrow">SCHOOL OFFICE HELP DESK</span>
            {c.office_hours ? <p>Open {c.office_hours}</p> : null}
            {c.office_phone || c.office_email ? (
              <p>
                {c.office_phone ? <a href={`tel:${c.office_phone.replace(/\s/g, "")}`}>{c.office_phone}</a> : null}
                {c.office_phone && c.office_email ? " · " : ""}
                {c.office_email ? <a href={`mailto:${c.office_email}`}>{c.office_email}</a> : null}
              </p>
            ) : null}
            {c.help_desk_note ? <small>{c.help_desk_note}</small> : null}
          </div>
        ) : null}
        <button className="item" onClick={() => go(43)}>
          <span>
            <strong>Health & emergency details</strong>
            <small>Update allergies and emergency contacts yourself</small>
          </span>
          <span className="value">›</span>
        </button>
        <button className="item" onClick={() => go(49)}>
          <span>
            <strong>Authorized pickup</strong>
            <small>People allowed to collect your child</small>
          </span>
          <span className="value">›</span>
        </button>
        <button className="item" onClick={() => go(41)}>
          <span>
            <strong>Documents & certificates</strong>
            <small>Upload documents or request a certificate</small>
          </span>
          <span className="value">›</span>
        </button>
      </section>
    </>
  );
}
