"use client";

/*
 * PM-044 · Help & requests. The API has no parent help-desk tickets, so a
 * "request" here is a conversation this parent opened with one of the
 * child's teachers about this child (GET /parent/me/conversations, filtered
 * to the selected child): who owns it, the latest reply and whether it is
 * closed.
 */

import Link from "next/link";
import { useParent } from "@/components/parent/ParentShell";
import { dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading } from "./pm";
import type { Conversation } from "./types";

export function HelpRequests() {
  return (
    <ChildGate>
      <Requests />
    </ChildGate>
  );
}

export function requestStatus(c: Conversation): [text: string, cls: string] {
  if (c.is_closed) return ["Closed", "value good"];
  if (c.unread_for_viewer > 0) return ["New reply", "value warning"];
  return ["Open", "value"];
}

function Requests() {
  const { childId, go } = useParent();
  const all = useApi<Conversation[]>(`/api/v1/parent/me/conversations`);
  const mine = (all.data ?? []).filter((c) => c.student_id === childId);

  return (
    <>
      <PmError>{all.error}</PmError>
      {all.loading && !all.data ? <PmLoading /> : null}
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
      {all.data && mine.length === 0 ? (
        <PmEmpty title="No requests yet">Questions you send to your child’s teachers will appear here with their replies.</PmEmpty>
      ) : null}
      <button className="action" onClick={() => go(45)}>
        Create a request
      </button>
      <section className="section">
        <h3>Contact school</h3>
        {/* Not wired: school-office help desk (hours, office-owned tickets) — no parent endpoint. */}
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
