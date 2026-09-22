"use client";

import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { date } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { BRANDING_PATH, childPath, ChildScoped, PmError, PmLoading, type Branding } from "./parts";
import type { StudentProfile as Profile } from "./types";

/** PM-008. The selected child's school record. */
export function StudentProfile() {
  return <ChildScoped render={(childId) => <ProfileFor childId={childId} />} />;
}

function ProfileFor({ childId }: { childId: number }) {
  const { go } = useParent();
  const p = useApi<Profile>(childPath(childId, "/profile"));
  const school = useApi<Branding>(BRANDING_PATH);

  if (p.error) return <PmError>{p.error}</PmError>;
  if (!p.data) return <PmLoading />;
  const s = p.data;

  return (
    <>
      <div className="student">
        <span className="student-photo large initials">{initialsOf(s.full_name)}</span>
        <div>
          <h2 className="child-name">{s.full_name}</h2>
          <p className="child-class">{[s.class_name, s.section_name ? `Section ${s.section_name}` : null].filter(Boolean).join(" · ") || "—"}</p>
          {school.data ? <small>{school.data.name}</small> : null}
        </div>
      </div>
      <dl>
        <div>
          <dt>Admission number</dt>
          <dd>{s.admission_no}</dd>
        </div>
        <div>
          <dt>Roll number</dt>
          <dd>{s.roll_no ?? "—"}</dd>
        </div>
        <div>
          <dt>Academic year</dt>
          <dd>{s.academic_year_name ?? "—"}</dd>
        </div>
        {/* Not wired: class teacher — the profile endpoint does not return one. */}
        {s.dob ? (
          <div>
            <dt>Date of birth</dt>
            <dd>{date(s.dob)}</dd>
          </div>
        ) : null}
        <div>
          <dt>School</dt>
          <dd>{school.data?.name ?? "—"}</dd>
        </div>
      </dl>
      <section className="section">
        <h3>Student records</h3>
        <button className="item" onClick={() => go(43)}>
          <span>
            <strong>{"Health & emergency"}</strong>
            <small>Medical details and contacts</small>
          </span>
          <span className="value">›</span>
        </button>
        <button className="item" onClick={() => go(41)}>
          <span>
            <strong>Documents</strong>
            <small>School-issued and uploaded files</small>
          </span>
          <span className="value">›</span>
        </button>
        <button className="item" onClick={() => go(55)}>
          <span>
            <strong>Weekly progress</strong>
            <small>Teacher summary and milestones</small>
          </span>
          <span className="value">›</span>
        </button>
      </section>
      <button className="action secondary" onClick={() => go(45)}>
        Request a correction
      </button>
    </>
  );
}
