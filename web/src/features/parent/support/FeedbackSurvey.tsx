"use client";

/*
 * PM-054 · Feedback survey. The API has no parent surveys or feedback forms
 * (no survey / custom-form endpoint in any portal), so this screen says so
 * plainly instead of showing a sample survey, and offers the channel that
 * does exist: a request to the child's teacher.
 */

import { useParent } from "@/components/parent/ParentShell";
import { PmEmpty } from "./pm";

export function FeedbackSurvey() {
  const { go } = useParent();
  return (
    <>
      {/* Not wired: school feedback surveys (questions, audience, submission status) — no endpoint. */}
      <PmEmpty title="No feedback surveys">
        School feedback surveys are not available in the app yet. You can still share feedback with your child’s teachers.
      </PmEmpty>
      <button className="action" onClick={() => go(45)}>
        Share feedback with a teacher
      </button>
      <button className="action secondary" onClick={() => go(44)}>
        Help & requests
      </button>
    </>
  );
}
