"use client";

import { useSyncExternalStore } from "react";
import { session, type Session } from "./session";

let cached: { raw: string | null; value: Session | null } = { raw: null, value: null };

function snapshot(): Session | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("bc_session");
  } catch {
    raw = null;
  }
  if (raw !== cached.raw) cached = { raw, value: session.get() };
  return cached.value;
}

/** The signed-in session; null on the server and while signed out. */
export function useSession(): Session | null {
  return useSyncExternalStore(session.subscribe, snapshot, () => null);
}

/** True once we are in the browser and can trust useSession's answer. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
