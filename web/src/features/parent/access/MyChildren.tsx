"use client";

import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { ActionLink, BRANDING_PATH, PmEmpty, PmError, PmLoading, type Branding } from "../home/parts";

/** PM-005. The children linked to this parent; picking one switches every screen to them. */
export function MyChildren() {
  const { children, childId, setChild, go, loading, error } = useParent();
  const signedIn = useSession()?.user.role === "parent";
  const school = useApi<Branding>(signedIn ? BRANDING_PATH : null);

  if (!signedIn) return <PmLoading />;
  if (error) return <PmError>{error}</PmError>;
  if (loading && children.length === 0) return <PmLoading />;

  return (
    <>
      <p className="lead">Choose a child to view their school day.</p>
      {children.length === 0 ? (
        <PmEmpty title="No child linked yet">Your child’s school links children to your account.</PmEmpty>
      ) : (
        children.map((c) => {
          const active = c.id === childId;
          return (
            <button
              key={c.id}
              type="button"
              className={`child-option ${active ? "active" : ""}`}
              onClick={() => {
                setChild(c.id);
                go(6);
              }}
            >
              <span className="student-photo large initials">{initialsOf(c.full_name)}</span>
              <span>
                <b>{c.full_name}</b>
                <small>{c.section_label ?? `Admission ${c.admission_no}`}</small>
                {school.data ? <small>{school.data.name}</small> : null}
              </span>
              <span className={active ? "tick" : undefined}>{active ? "✓" : "›"}</span>
            </button>
          );
        })
      )}
      <ActionLink secondary href={parentRoute(4)}>
        Link another child
      </ActionLink>
    </>
  );
}
