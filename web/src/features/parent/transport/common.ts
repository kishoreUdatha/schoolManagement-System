"use client";

// Shared by the parent transport screens PM-029…PM-032 (GET /parent/me/children/{id}/transport).

import { useApi } from "@/lib/useApi";
import { useEvery } from "../comms/ui";

export type TodayTrip = {
  direction: "pickup" | "drop";
  trip_status: "scheduled" | "in_progress" | "completed" | "cancelled" | string;
  boarding_status: "boarded" | "dropped" | "absent" | null;
  marked_at: string | null;
};

export type ChildTransport = {
  route_name: string;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: "both" | "pickup" | "drop";
  vehicle_label: string | null;
  registration_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  today: TodayTrip[];
};

/** A bus position older than this is not shown as live. */
export const STALE_MINUTES = 5;

/** The child's transport, refreshed every 30 s so the bus position stays current. `data` null = not on transport. */
export function useTransport(childId: number | null, poll = false) {
  const t = useApi<ChildTransport | null>(childId ? `/api/v1/parent/me/children/${childId}/transport` : null);
  // Poll only while the child is on transport (a null answer has nothing to refresh).
  useEvery(30_000, t.reload, poll && Boolean(childId) && Boolean(t.data));
  return t;
}

/** Minutes since the last GPS fix, or null when there is none. */
export function gpsAge(t: ChildTransport): number | null {
  if (!t.last_location_at) return null;
  const ms = Date.now() - new Date(t.last_location_at).getTime();
  return Number.isNaN(ms) ? null : Math.max(0, Math.round(ms / 60_000));
}

export const isFresh = (t: ChildTransport) => {
  const age = gpsAge(t);
  return age !== null && age <= STALE_MINUTES && t.last_lat !== null && t.last_lng !== null;
};

/** The trip that matters now: one under way, else the next scheduled, else the last one today. */
export function currentTrip(t: ChildTransport): TodayTrip | null {
  return (
    t.today.find((x) => x.trip_status === "in_progress") ??
    t.today.find((x) => x.trip_status === "scheduled") ??
    t.today[t.today.length - 1] ??
    null
  );
}

export const tripName = (d: "pickup" | "drop") => (d === "pickup" ? "Morning pickup" : "Afternoon drop");

export function boardingText(x: TodayTrip): string {
  if (x.boarding_status === "boarded") return "Boarded";
  if (x.boarding_status === "dropped") return "Dropped at stop";
  if (x.boarding_status === "absent") return "Marked absent";
  return x.trip_status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Scheduled time at the child's stop for a trip direction. */
export const stopTime = (t: ChildTransport, d: "pickup" | "drop") => (d === "pickup" ? t.pickup_time : t.drop_time);
