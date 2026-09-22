"use client";

import { useRouter } from "next/navigation";
import { parentRoute } from "@/lib/parentScreens";
import { useSession } from "@/lib/useSession";

/** PM-001's call to action: sign in, or straight home when already signed in. */
export function WelcomeStart() {
  const router = useRouter();
  const signedIn = useSession()?.user.role === "parent";
  return (
    <button type="button" className="action" onClick={() => router.push(parentRoute(signedIn ? 6 : 2))}>
      {signedIn ? "Continue" : "Get started"}
    </button>
  );
}
