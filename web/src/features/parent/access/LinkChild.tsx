"use client";

import { useParent } from "@/components/parent/ParentShell";
import { parentRoute } from "@/lib/parentScreens";
import { useSession } from "@/lib/useSession";
import { ActionLink } from "../home/parts";

/**
 * PM-004. The API has no self-service linking: the school links a parent
 * account to a child. So the screen shows the pack's "pending school
 * verification" state and explains what to do, instead of a form that
 * would go nowhere.
 * Not wired: the request form (admission number, relationship, date of birth) — no endpoint.
 */
export function LinkChild() {
  const sess = useSession();
  const { children, reloadChildren, notify, loading } = useParent();
  const signedIn = sess?.user.role === "parent";

  return (
    <>
      <p className="lead">Your child’s school connects your parent account to your child.</p>
      <div className="panel soft">
        <span className="status amber">Pending school verification</span>
        <h3>School verification</h3>
        <p>
          Children cannot be linked from the app. Give the school office your child’s admission number and the email address
          you sign in with{sess?.user.email ? ` (${sess.user.email})` : ""}. Once the school verifies the relationship, your
          child appears under My children and their records become available.
        </p>
      </div>
      {signedIn ? (
        <>
          <p className="micro">
            {loading ? "Checking your linked children…" : `${children.length} ${children.length === 1 ? "child is" : "children are"} linked to your account.`}
          </p>
          <button
            type="button"
            className="action"
            onClick={() => {
              reloadChildren();
              notify("Checked with the school for newly linked children.");
            }}
          >
            Check again
          </button>
          <ActionLink secondary href={parentRoute(5)}>
            Back to my children
          </ActionLink>
        </>
      ) : (
        <ActionLink href={parentRoute(2)}>Sign in</ActionLink>
      )}
    </>
  );
}
