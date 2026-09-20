"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { auth } from "@/lib/auth";

export function StudentGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    const token = auth.getToken();
    if (!token || !user || user.role !== "student") {
      auth.clear();
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      router.replace(`/student/login?next=${next}`);
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
