"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/*
 * Shapes returned by /api/v1/school/inventory/*, /labs and /lab-bookings,
 * and the few pieces every inventory screen shares.
 */

export const INV = "/api/v1/school/inventory";

export type Supplier = { id: number; name: string; contact_person: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; category: string | null; is_active: boolean };

export type Item = {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  unit: string;
  reorder_level: string;
  is_sellable: boolean;
  sale_price: string | null;
  location: string | null;
  description: string | null;
  is_active: boolean;
  on_hand: string;
  low_stock: boolean;
  stock_value: string | null;
};

export type MoveKind = "purchase" | "return_in" | "adjustment_in" | "issue" | "sale" | "damage" | "adjustment_out";

export type Move = {
  id: number;
  item_id: number;
  item_name: string;
  kind: MoveKind;
  direction: number;
  qty: string;
  unit_cost: string | null;
  moved_on: string;
  supplier_name: string | null;
  reference: string | null;
  issued_to: string | null;
  location: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  balance_after: string | null;
};

export type AssetStatus = "in_store" | "in_use" | "under_repair" | "disposed";

export type AssetEvent = { id: number; kind: string; happened_on: string; to_user_name: string | null; location: string | null; cost: string | null; notes: string | null; recorded_by_name?: string | null };

export type Asset = {
  id: number;
  asset_tag: string;
  name: string;
  category: string | null;
  serial_no: string | null;
  location: string | null;
  assigned_to_user_id: number | null;
  assigned_to_name: string | null;
  status: AssetStatus;
  purchase_date: string | null;
  cost: string | null;
  supplier_name: string | null;
  warranty_until: string | null;
  warranty_active: boolean;
  maintenance_cost: string;
  notes: string | null;
  open_issue?: string | null;
  issue_reported_on?: string | null;
  events?: AssetEvent[];
};

export type Assignment = {
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  event_id: number;
  user_id: number | null;
  user_name: string | null;
  assigned_on: string;
  returned_on: string | null;
  ended_by: string | null;
  location: string | null;
  notes: string | null;
};

export type Dashboard = {
  items: number;
  low_stock: { id: number; name: string; on_hand: string; reorder_level: string; unit: string }[];
  stock_value: string;
  assets: number;
  assets_in_repair: number;
  warranty_expiring: number;
  store_sales_today: string;
  store_sales_month: string;
};

export type Valuation = {
  stock_value: string;
  asset_value: string;
  items: number;
  assets: number;
  by_category: { label: string; items: number; value: string }[];
  assets_by_status: { label: string; count: number; value: string }[];
  low_stock: { item_id: number; name: string; sku: string | null; on_hand: string; reorder_level: string }[];
};

export type Lab = {
  id: number;
  name: string;
  code: string;
  room_id: number | null;
  room_name: string | null;
  subject_id: number | null;
  subject_name: string | null;
  in_charge_user_id: number | null;
  in_charge_name: string | null;
  capacity: number | null;
  equipment: string | null;
  safety_notes: string | null;
  is_active: boolean;
  upcoming_bookings?: number;
};

export type LabBooking = {
  id: number;
  lab_id: number;
  lab_name: string;
  booking_date: string;
  period_number: number;
  start_time: string | null;
  end_time: string | null;
  section_label: string | null;
  subject_name: string | null;
  teacher_name: string | null;
  purpose: string | null;
  students: number | null;
  status: string;
};

export type StaffRow = { user_id: number; full_name: string; role?: string };

/** "12.00" -> "12"; "12.50" -> "12.5". */
export const qty = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const ASSET_STATUS: Record<AssetStatus, string> = {
  in_store: "In store",
  in_use: "In use",
  under_repair: "Under repair",
  disposed: "Disposed",
};

export const MOVE_LABEL: Record<MoveKind, string> = {
  purchase: "Purchase",
  return_in: "Returned",
  adjustment_in: "Stock-take +",
  issue: "Issued",
  sale: "Store sale",
  damage: "Damaged / written off",
  adjustment_out: "Stock-take −",
};

/** Today in the viewer's calendar, as the API's yyyy-mm-dd. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from today until `iso`; null when there is no date. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const now = new Date();
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}

/** Empty inputs become null, as the API expects for optional fields. */
export const orNull = (v: FormDataEntryValue | string | null | undefined) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** A labelled control in the mock's `.field` style. */
export function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/** The mock's dialog (`.modal-backdrop` / `.modal`), driven by React. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop show"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: wide ? 760 : 560, maxHeight: "90vh", overflow: "auto" }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Save / cancel row at the foot of a dialog form. */
export function ModalActions({ saving, label, onCancel }: { saving: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="row actions" style={{ justifyContent: "flex-end", marginTop: 20, gap: 8 }}>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={saving}>
        <Icon name="check" className="sm" />
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

/**
 * The page-head "Add …" buttons link to the same screen with ?new=1; this
 * reads that flag and clears it again when the dialog closes.
 */
export function useNewFlag(): [boolean, () => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const open = params.get("new") === "1";
  const close = () => {
    const q = new URLSearchParams(params.toString());
    q.delete("new");
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  return [open, close];
}

/** The warning tip used for failed loads and rejected saves. */
export function Tip({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className={`tip ${warn ? "warn" : ""}`}>
      <Icon name={warn ? "bell" : "shield"} className="sm" />
      <span>{children}</span>
    </div>
  );
}

/** A horizontal bar list (`.bar-list`) scaled to the largest value. */
export function BarList({ rows, format }: { rows: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.label}>
          <span>{r.label}</span>
          <div className="bar-track">
            <i style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          <strong>{format(r.value)}</strong>
        </div>
      ))}
    </div>
  );
}
