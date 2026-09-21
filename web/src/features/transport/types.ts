// Shapes returned by /api/v1/school/transport/*.

export type VehicleKind = "bus" | "mini_bus" | "van" | "car" | "other";

export type Vehicle = {
  id: number;
  registration_no: string;
  label: string | null;
  kind: VehicleKind;
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

export type CrewRole = "driver" | "conductor" | "attendant";

export type Crew = {
  id: number;
  full_name: string;
  role: CrewRole;
  phone: string;
  license_no: string | null;
  license_expiry: string | null;
  address: string | null;
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

export type Direction = "both" | "pickup" | "drop";

export type Assignment = {
  id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  route_id: number;
  route_name: string;
  stop_id: number;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: Direction;
  monthly_fee: string;
  start_date: string;
  end_date: string | null;
};

export type TripStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type Trip = {
  id: number;
  route_id: number;
  route_name: string;
  vehicle_id: number | null;
  vehicle_label: string | null;
  driver_name: string | null;
  trip_date: string;
  direction: "pickup" | "drop";
  status: TripStatus;
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

export type TripStudent = {
  student_id: number;
  student_name: string;
  section_label: string | null;
  stop_id: number;
  stop_name: string;
  stop_sequence: number;
  status: "boarded" | "dropped" | "absent" | null;
  marked_at: string | null;
};

export type TripDetail = Trip & { students: TripStudent[] };

export type LogKind = "fuel" | "service" | "repair" | "tyre" | "insurance" | "other";

export type VehicleLog = {
  id: number;
  vehicle_id: number;
  kind: LogKind;
  log_date: string;
  odometer_km: number | null;
  amount: string | null;
  litres: string | null;
  vendor: string | null;
  notes: string | null;
  created_at: string;
};

export type LocationPoint = { lat: number; lng: number; speed_kmph: number | null; recorded_at: string };

export type TransportDashboard = {
  vehicles: number;
  active_routes: number;
  students_using_transport: number;
  seats_total: number;
  trips_today: number;
  trips_in_progress: number;
  /** A vehicle document (vehicle_id) or a driver's licence (crew_id) expired or due within 30 days. */
  expiring_documents: { vehicle_id?: number; crew_id?: number; vehicle: string; message: string }[];
  /** Routes carrying more students than their vehicle seats. */
  overloaded_routes: { route_id: number; route: string; students: number; capacity: number }[];
};

export type FeeHead = { id: number; name: string; code: string; is_active: boolean };

export const KIND_LABEL: Record<VehicleKind, string> = { bus: "School bus", mini_bus: "Mini bus", van: "Van", car: "Car", other: "Other" };
