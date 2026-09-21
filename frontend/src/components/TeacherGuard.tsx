"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { auth } from "@/lib/auth";

export function TeacherGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    const token = auth.getToken();
    if (!token || !user || user.role !== "teacher") {
      auth.clear();
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      router.replace(`/teacher/login?next=${next}`);
      return;
    }
    // A password somebody else typed is not a password. Until they choose
    // their own, the only page they can reach is the one that changes it.
    if (user.must_change_password && !window.location.pathname.startsWith("/account/change-password")) {
      router.replace("/account/change-password?first=1");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
