"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";

/** What to say, depending on why somebody landed here.
 *
 *  None of it blames the reader and none of it mentions a status code. A
 *  person who has been signed out did nothing wrong, and "403" tells them
 *  nothing they can act on. */
const REASONS: Record<string, { title: string; body: string }> = {
  expired: {
    title: "You have been signed out",
    body:
      "You were away for a while, so we signed you out to keep the account safe. Signing in again will pick up where you left off.",
  },
  forbidden: {
    title: "That page belongs to a different account",
    body:
      "This part of the system is for another kind of account. If you think you should be able to see it, the school office can check what your account is set up for.",
  },
};

const FALLBACK = {
  title: "We could not open that page",
  body:
    "You may need to sign in first, or the page may belong to a different kind of account.",
};

export default function DeniedPage() {
  return (
    <Suspense fallback={null}>
      <Denied />
    </Suspense>
  );
}

function Denied() {
  const search = useSearchParams();
  const reason = search.get("reason") ?? "";
  const { title, body } = REASONS[reason] ?? FALLBACK;

  // The panel's default copy is cheerful, which reads badly next to a page
  // somebody could not open, so this screen brings its own quieter words.
  return (
    <AuthShell
      title={title}
      subtitle={body}
      headline={"Nothing is lost.\nJust sign in again."}
      blurb="Your work is where you left it. Signing in again picks it back up."
      topRight={
        <>
          Wrong account?{" "}
          <Link href="/workspace" className="font-bold text-brand-600 hover:underline">
            Change workspace
          </Link>
        </>
      }
      footer="Need help? Contact your school administrator."
    >
      <Link href="/workspace">
        <Button className="w-full">Sign in</Button>
      </Link>
    </AuthShell>
  );
}
