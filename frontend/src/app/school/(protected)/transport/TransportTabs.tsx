"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/school/transport", label: "Overview" },
  { href: "/school/transport/routes", label: "Routes & stops" },
  { href: "/school/transport/students", label: "Students" },
  { href: "/school/transport/vehicles", label: "Vehicles" },
  { href: "/school/transport/crew", label: "Drivers & crew" },
];

export function TransportTabs() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-surface-border">
      {TABS.map((t) => {
        const active = t.href === "/school/transport" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? "border-brand-500 text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export type Crew = {
  id: number;
  full_name: string;
  role: "driver" | "conductor" | "attendant";
  phone: string;
  license_no: string | null;
  license_expiry: string | null;
  address: string | null;
  is_active: boolean;
};

export type Vehicle = {
  id: number;
  registration_no: string;
  label: string | null;
  kind: string;
  capacity: number;
  make_model: string | null;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  conductor_id: number | null;
  conductor_name: string | null;
  insurance_expiry: string | null;
  fitness_expiry: string | null;
  permit_expiry: string | null;
  pollution_expiry: string | null;
  expiring_documents: string[];
  gps_enabled: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kmph: number | null;
  last_location_at: string | null;
  assigned_students: number;
  is_active: boolean;
};

export type Stop = {
  id: number;
  name: string;
  sequence: number;
  pickup_time: string | null;
  drop_time: string | null;
  monthly_fee: string | null;
  effective_fee: string;
  lat: number | null;
  lng: number | null;
  student_count: number;
};

export type Route = {
  id: number;
  name: string;
  code: string;
  vehicle_id: number | null;
  vehicle_label: string | null;
  vehicle_capacity: number | null;
  monthly_fee: string;
  is_active: boolean;
  stops: Stop[];
  student_count: number;
};

export type Trip = {
  id: number;
  route_id: number;
  route_name: string;
  vehicle_label: string | null;
  driver_name: string | null;
  trip_date: string;
  direction: "pickup" | "drop";
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  started_at: string | null;
  ended_at: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  distance_km: number | null;
  notes: string | null;
  expected: number;
  boarded: number;
  absent: number;
};

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "—";
}
