"use client";

/*
 * Small pieces the parent-app screens share: the selected child's API base,
 * and loading / error / empty states drawn with the Parent Mobile pack's
 * classes (panel, micro, value …) so they sit inside the phone frame.
 */

import { Fragment, type ReactNode } from "react";
import { useParent } from "@/components/parent/ParentShell";

/** `/api/v1/parent/me/children/{childId}{suffix}`, or null until a child is selected. */
export function useChildPath(suffix = ""): string | null {
  const { childId } = useParent();
  return childId ? `/api/v1/parent/me/children/${childId}${suffix}` : null;
}

export function PmLoading({ what = "Loading…" }: { what?: string }) {
  return (
    <p className="micro" aria-busy="true">
      {what}
    </p>
  );
}

export function PmError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="panel soft" role="alert">
      <p className="bad">{children}</p>
    </div>
  );
}

export function PmEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel soft">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/**
 * Shown instead of a child-scoped screen while the children load, when
 * loading them failed, or when no child is linked to this account.
 */
export function ChildGate({ children }: { children: ReactNode }) {
  const { childId, loading, error, go } = useParent();
  // Keyed on the child so form state never carries over to a sibling.
  if (childId) return <Fragment key={childId}>{children}</Fragment>;
  if (loading) return <PmLoading />;
  if (error) return <PmError>{error}</PmError>;
  return (
    <>
      <PmEmpty title="No child linked">Link your child to this account to see this screen.</PmEmpty>
      <button className="action" onClick={() => go(4)}>
        Link a child
      </button>
    </>
  );
}

/** "In progress" style value colours from the pack: good / warning / bad / plain. */
export type Tone = "good" | "warning" | "bad" | "";

export const valueClass = (tone: Tone) => (tone ? `value ${tone}` : "value");

/** Trim a form value; empty becomes null (the API's "not given"). */
export const orNull = (v: string) => (v.trim() ? v.trim() : null);
