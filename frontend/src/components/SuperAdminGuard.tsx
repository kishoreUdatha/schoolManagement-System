"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { auth } from "@/lib/auth";

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    const token = auth.getToken();
    if (!token || !user || user.role !== "super_admin") {
      auth.clear();
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      router.replace(`/super-admin/login?next=${next}`);
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
