"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function HealthBadge() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    api
      .get("/api/v1/health")
      .then(() => setStatus("ok"))
      .catch(() => setStatus("down"));
  }, []);

  const color =
    status === "ok"
      ? "bg-success-bg text-success"
      : status === "down"
      ? "bg-danger-bg text-danger"
      : "bg-surface-hover text-ink-muted";

  const label =
    status === "ok" ? "API online" : status === "down" ? "API offline" : "Checking…";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
