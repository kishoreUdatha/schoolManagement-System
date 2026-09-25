"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

let cached: Promise<boolean> | null = null;

/** Whether the server has AI (Claude) configured. Cached per page load. */
export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    cached ??= api
      .get<{ enabled: boolean }>("/api/v1/ai/status")
      .then((r) => r.data.enabled)
      .catch(() => false);
    cached.then(setEnabled);
  }, []);
  return enabled;
}
