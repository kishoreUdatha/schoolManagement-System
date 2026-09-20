"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

const API = "/api/v1/school/inventory";

type Supplier = { id: number; name: string; contact_person: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; is_active: boolean };
type Item = { id: number; name: string; sku: string; category: string | null; unit: string; reorder_level: string; is_sellable: boolean; sale_price: string | null; location: string | null; description: string | null; is_active: boolean; on_hand: string; low_stock: boolean; stock_value: string | null };
type Move = { id: number; item_name: string; kind: string; direction: number; qty: string; unit_cost: string | null; moved_on: string; supplier_name: string | null; reference: string | null; issued_to: string | null; notes: string | null; recorded_by_name: string | null; balance_after: string | null };
type AssetEvent = { id: number; kind: string; happened_on: string; to_user_name: string | null; location: string | null; cost: string | null; notes: string | null };
type Asset = { id: number; asset_tag: string; name: string; category: string | null; serial_no: string | null; location: string | null; assigned_to_name: string | null; status: string; purchase_date: string | null; cost: string | null; supplier_name: string | null; warranty_until: string | null; warranty_active: boolean; maintenance_cost: string; events?: AssetEvent[] };
type Sale = { id: number; bill_no: string; student_name: string | null; buyer_name: string | null; sold_on: string; total: string; payment: string; is_void: boolean; sold_by_name: string | null; lines: { item_name: string; qty: string; unit_price: string; amount: string }[] };
type Dash = { items: number; low_stock: { id: number; name: string; on_hand: string; reorder_level: string; unit: string }[]; stock_value: string; assets: number; assets_in_repair: number; warranty_expiring: number; store_sales_today: string; store_sales_month: string };

const q = (n: string | number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
type Handlers = { onChange: (m: string) => void; onError: (m: string) => void };

export function InventoryApp() {
  const [tab, setTab] = useState<"overview" | "stock" | "assets" | "store" | "suppliers">("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => {
    setNotice(m);
    setError(null);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Inventory & store" subtitle="Stock, fixed assets, the school store counter and suppliers." />
      <nav className="flex flex-wrap gap-1 border-b border-surface-border">
        {(["overview", "stock", "assets", "store", "suppliers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {{ overview: "Overview", stock: "Items & stock", assets: "Assets", store: "Store counter", suppliers: "Suppliers" }[t]}
          </button>
        ))}
      </nav>
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {tab === "overview" && <Overview onError={setError} />}
      {tab === "stock" && <Stock onChange={flash} onError={setError} />}
      {tab === "assets" && <Assets onChange={flash} onError={setError} />}
      {tab === "store" && <Store onChange={flash} onError={setError} />}
      {tab === "suppliers" && <Suppliers onChange={flash} onError={setError} />}
    </div>
  );
}

function Overview({ onError }: { onError: (m: string) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  useEffect(() => {
    api.get<Dash>(`${API}/dashboard`).then((r) => setD(r.data)).catch((e) => onError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!d) return null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Items" value={d.items} />
        <StatCard label="Stock value" value={inr(d.stock_value)} hint="at average cost" />
        <StatCard label="Assets" value={d.assets} />
        <StatCard label="In repair" value={d.assets_in_repair} accent={d.assets_in_repair ? "amber" : "brand"} />
        <StatCard label="Store today" value={inr(d.store_sales_today)} />
        <StatCard label="Store this month" value={inr(d.store_sales_month)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Low stock · {d.low_stock.length}</CardTitle>
          {d.warranty_expiring > 0 && <span className="text-sm text-amber-500">{d.warranty_expiring} asset warranties end within 30 days</span>}
        </CardHeader>
        <Table head={["Item", "On hand", "Reorder at"]} empty={d.low_stock.length === 0 && "Nothing below its reorder level."}>
          {d.low_stock.map((i) => (
            <tr key={i.id}>
              <td className={tdStrong}>{i.name}</td>
              <td className="px-4 py-3 text-rose-400">
                {q(i.on_hand)} {i.unit}
              </td>
              <td className={td}>{q(i.reorder_level)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Stock({ onChange, onError }: Handlers) {
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [history, setHistory] = useState<Item | null>(null);

  async function load() {
    try {
      const [i, s] = await Promise.all([api.get<Item[]>(`${API}/items`, { params: { q: search || undefined } }), api.get<Supplier[]>(`${API}/suppliers`)]);
      setItems(i.data);
      setSuppliers(s.data.filter((x) => x.is_active));
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Input label="Search" placeholder="Name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <Button onClick={() => setEditing("new")}>+ New item</Button>
      </div>
      <Card>
        <Table head={["Item", "Category", "On hand", "Value", "Store price", ""]} empty={items.length === 0 && "No items."}>
          {items.map((i) => (
            <tr key={i.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                {i.name} {!i.is_active && <Badge>inactive</Badge>}
                <div className="text-xs font-normal text-ink-subtle">
                  {i.sku}
                  {i.location && ` · ${i.location}`}
                </div>
              </td>
              <td className={td}>{i.category ?? "—"}</td>
              <td className={`px-3 py-2 ${i.low_stock ? "font-medium text-rose-400" : "text-ink-muted"}`}>
                {q(i.on_hand)} {i.unit}
                {i.low_stock && <div className="text-xs">below {q(i.reorder_level)}</div>}
              </td>
              <td className={td}>{inr(i.stock_value)}</td>
              <td className={td}>{i.is_sellable ? inr(i.sale_price) : "—"}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <Button size="sm" onClick={() => setMoving(i)}>
                  Stock in / out
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setHistory(i)}>
                  Ledger
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {editing && (
        <ItemModal
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            onChange(m);
            load();
          }}
        />
      )}
      {moving && (
        <MoveModal
          item={moving}
          suppliers={suppliers}
          onClose={() => setMoving(null)}
          onSaved={(m) => {
            setMoving(null);
            onChange(m);
            load();
          }}
        />
      )}
      {history && <LedgerModal item={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function ItemModal({ existing, onClose, onSaved }: { existing: Item | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({
    name: existing?.name ?? "",
    sku: existing?.sku ?? "",
    category: existing?.category ?? "",
    unit: existing?.unit ?? "pcs",
    reorder_level: existing?.reorder_level ?? "0",
    is_sellable: existing?.is_sellable ?? false,
    sale_price: existing?.sale_price ?? "",
    location: existing?.location ?? "",
    is_active: existing?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New item"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const payload = { ...f, sku: f.sku || null, category: f.category || null, location: f.location || null, sale_price: f.sale_price || null };
          try {
            if (existing) await api.put(`${API}/items/${existing.id}`, payload);
            else await api.post(`${API}/items`, payload);
            onSaved(`Saved ${f.name}.`);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={f.name} onChange={set("name")} required />
          <Input label="SKU" placeholder="Automatic" value={f.sku} onChange={set("sku")} />
          <Input label="Category" placeholder="Stationery, Uniform, Lab…" value={f.category} onChange={set("category")} />
          <Input label="Unit" value={f.unit} onChange={set("unit")} />
          <Input label="Reorder when below" type="number" min="0" value={f.reorder_level} onChange={set("reorder_level")} />
          <Input label="Location" placeholder="Store room / Lab 2" value={f.location} onChange={set("location")} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={f.is_sellable} onChange={(e) => setF({ ...f, is_sellable: e.target.checked })} />
          Sold in the school store
        </label>
        {f.is_sellable && <Input label="Store price ₹ *" type="number" min="0" step="0.01" value={f.sale_price} onChange={set("sale_price")} required />}
        {existing && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            Active
          </label>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

const MOVE_KINDS = [
  ["purchase", "Purchase (in)"],
  ["return_in", "Returned (in)"],
  ["issue", "Issue (out)"],
  ["damage", "Damaged / written off (out)"],
  ["adjustment_in", "Stock-take + (in)"],
  ["adjustment_out", "Stock-take − (out)"],
] as const;

function MoveModal({ item, suppliers, onClose, onSaved }: { item: Item; suppliers: Supplier[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ kind: "purchase", qty: "", unit_cost: "", supplier_id: "", reference: "", issued_to: "", notes: "", moved_on: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? v.trim() : null);
  return (
    <Modal open onClose={onClose} title={`${item.name} · ${q(item.on_hand)} ${item.unit} on hand`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const { data } = await api.post<{ on_hand: string }>(`${API}/moves`, {
              item_id: item.id,
              kind: f.kind,
              qty: f.qty,
              unit_cost: n(f.unit_cost),
              supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
              reference: n(f.reference),
              issued_to: n(f.issued_to),
              notes: n(f.notes),
              moved_on: f.moved_on,
            });
            onSaved(`${item.name}: now ${q(data.on_hand)} ${item.unit}.`);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="What happened" value={f.kind} onChange={set("kind")}>
            {MOVE_KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Input label={`Quantity (${item.unit}) *`} type="number" min="0.01" step="0.01" value={f.qty} onChange={set("qty")} required />
          <Input label="Date" type="date" value={f.moved_on} onChange={set("moved_on")} />
          {f.kind === "purchase" && (
            <>
              <Input label="Cost per unit ₹ *" type="number" min="0" step="0.01" value={f.unit_cost} onChange={set("unit_cost")} required />
              <Select label="Supplier" value={f.supplier_id} onChange={set("supplier_id")}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Input label="Invoice no." value={f.reference} onChange={set("reference")} />
            </>
          )}
          {(f.kind === "issue" || f.kind === "return_in") && (
            <Input label={f.kind === "issue" ? "Issued to *" : "Returned by"} placeholder="Class 5A, Science lab, Mr. Rao" value={f.issued_to} onChange={set("issued_to")} required={f.kind === "issue"} />
          )}
        </div>
        <Input label="Notes" value={f.notes} onChange={set("notes")} />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function LedgerModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [moves, setMoves] = useState<Move[]>([]);
  useEffect(() => {
    api.get<Move[]>(`${API}/moves`, { params: { item_id: item.id } }).then((r) => setMoves(r.data)).catch(() => undefined);
  }, [item.id]);
  return (
    <Modal open onClose={onClose} title={`Ledger — ${item.name}`} size="lg">
      <Table head={["Date", "Movement", "Qty", "Balance", "Details"]} empty={moves.length === 0 && "No movements yet."}>
        {moves.map((m) => (
          <tr key={m.id}>
            <td className={td}>{m.moved_on}</td>
            <td className={td}>{humanize(m.kind)}</td>
            <td className={`px-3 py-2 ${m.direction > 0 ? "text-emerald-500" : "text-rose-400"}`}>
              {m.direction > 0 ? "+" : "−"}
              {q(m.qty)}
            </td>
            <td className={td}>{m.balance_after !== null ? q(m.balance_after) : "—"}</td>
            <td className={td}>
              {[m.supplier_name, m.reference, m.issued_to, m.unit_cost && `@ ${inr(m.unit_cost)}`, m.notes].filter(Boolean).join(" · ") || "—"}
              {m.recorded_by_name && <div className="text-xs text-ink-subtle">by {m.recorded_by_name}</div>}
            </td>
          </tr>
        ))}
      </Table>
    </Modal>
  );
}

function Assets({ onChange, onError }: Handlers) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Asset | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Asset[]>(`${API}/assets`, { params: { q: search || undefined, status: status || undefined } });
      setAssets(data);
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const tone = { in_store: "neutral", in_use: "emerald", under_repair: "amber", disposed: "rose" } as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Input label="Search" placeholder="Name, tag, serial, location" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All (not disposed)</option>
            <option value="in_use">In use</option>
            <option value="in_store">In store</option>
            <option value="under_repair">Under repair</option>
            <option value="disposed">Disposed</option>
          </Select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreating(true)}>+ New asset</Button>
      </div>
      <Card>
        <Table head={["Tag", "Asset", "Where / who", "Status", "Cost", "Warranty"]} empty={assets.length === 0 && "No assets."}>
          {assets.map((a) => (
            <tr key={a.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => setOpen(a)}>
              <td className="px-4 py-3 text-[12px] tabular-nums text-ink">{a.asset_tag}</td>
              <td className={tdStrong}>
                {a.name}
                <div className="text-xs font-normal text-ink-subtle">{[a.category, a.serial_no].filter(Boolean).join(" · ")}</div>
              </td>
              <td className={td}>{[a.location, a.assigned_to_name].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-4 py-3">
                <Badge tone={tone[a.status as keyof typeof tone]}>{humanize(a.status)}</Badge>
              </td>
              <td className={td}>
                {inr(a.cost)}
                {Number(a.maintenance_cost) > 0 && <div className="text-xs text-ink-subtle">+{inr(a.maintenance_cost)} upkeep</div>}
              </td>
              <td className={td}>{a.warranty_until ? <span className={a.warranty_active ? "" : "text-ink-subtle line-through"}>{a.warranty_until}</span> : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {creating && (
        <AssetModal
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            setCreating(false);
            onChange(m);
            load();
          }}
        />
      )}
      {open && (
        <AssetDetailModal
          assetId={open.id}
          onClose={() => {
            setOpen(null);
            load();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function AssetModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [f, setF] = useState({ asset_tag: "", name: "", category: "", serial_no: "", location: "", purchase_date: "", cost: "", supplier_id: "", warranty_until: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Supplier[]>(`${API}/suppliers`).then((r) => setSuppliers(r.data)).catch(() => undefined);
  }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="New asset">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : k === "supplier_id" ? Number(v) : v]));
          try {
            const { data } = await api.post<Asset>(`${API}/assets`, payload);
            onSaved(`Added ${data.name} as ${data.asset_tag}.`);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={f.name} onChange={set("name")} required />
          <Input label="Asset tag" placeholder="Automatic" value={f.asset_tag} onChange={set("asset_tag")} />
          <Input label="Category" placeholder="Electronics, Furniture…" value={f.category} onChange={set("category")} />
          <Input label="Serial no." value={f.serial_no} onChange={set("serial_no")} />
          <Input label="Location" value={f.location} onChange={set("location")} />
          <Input label="Purchased on" type="date" value={f.purchase_date} onChange={set("purchase_date")} />
          <Input label="Cost ₹" type="number" min="0" value={f.cost} onChange={set("cost")} />
          <Select label="Supplier" value={f.supplier_id} onChange={set("supplier_id")}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input label="Warranty until" type="date" value={f.warranty_until} onChange={set("warranty_until")} />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add</Button>
        </div>
      </form>
    </Modal>
  );
}

const NEXT: Record<string, [string, string][]> = {
  in_store: [["assigned", "Assign / install"], ["moved", "Move"], ["maintenance", "Send for repair"], ["disposed", "Dispose"]],
  in_use: [["returned", "Return to store"], ["assigned", "Reassign"], ["moved", "Move"], ["maintenance", "Send for repair"]],
  under_repair: [["repaired", "Repaired"], ["disposed", "Dispose"]],
  disposed: [],
};

function AssetDetailModal({ assetId, onClose, onError }: { assetId: number; onClose: () => void; onError: (m: string) => void }) {
  const [a, setA] = useState<Asset | null>(null);
  const [staff, setStaff] = useState<{ user_id: number; full_name: string }[]>([]);
  const [ev, setEv] = useState({ kind: "", to_user_id: "", location: "", cost: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Asset>(`${API}/assets/${assetId}`).then((r) => setA(r.data)).catch((e) => onError(apiError(e)));
    api.get<{ user_id: number; full_name: string }[]>("/api/v1/school/directory/staff").then((r) => setStaff(r.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);
  if (!a) return null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { data } = await api.post<Asset>(`${API}/assets/${assetId}/events`, {
        kind: ev.kind,
        to_user_id: ev.to_user_id ? Number(ev.to_user_id) : null,
        location: ev.location || null,
        cost: ev.cost || null,
        notes: ev.notes || null,
      });
      setA(data);
      setEv({ kind: "", to_user_id: "", location: "", cost: "", notes: "" });
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  }
  const set = (k: keyof typeof ev) => (e: { target: { value: string } }) => setEv({ ...ev, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={`${a.asset_tag} · ${a.name}`} size="lg">
      <div className="space-y-4">
        <div className="text-sm text-ink-muted">
          {humanize(a.status)} · {[a.location, a.assigned_to_name].filter(Boolean).join(" · ") || "no location"} · cost {inr(a.cost)}
          {a.supplier_name && ` from ${a.supplier_name}`}
        </div>
        {NEXT[a.status].length > 0 && (
          <form onSubmit={submit} className="space-y-3 rounded-lg border border-surface-border p-3">
            <div className="flex flex-wrap gap-2">
              {NEXT[a.status].map(([k, l]) => (
                <Button key={k} type="button" size="sm" variant={ev.kind === k ? "primary" : "secondary"} onClick={() => setEv({ ...ev, kind: k })}>
                  {l}
                </Button>
              ))}
            </div>
            {ev.kind && (
              <div className="grid gap-3 sm:grid-cols-2">
                {ev.kind === "assigned" && (
                  <Select label="To staff member" value={ev.to_user_id} onChange={set("to_user_id")}>
                    <option value="">— (location only)</option>
                    {staff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.full_name}
                      </option>
                    ))}
                  </Select>
                )}
                {["assigned", "moved", "returned"].includes(ev.kind) && <Input label="Location" value={ev.location} onChange={set("location")} required={ev.kind === "moved"} />}
                {["maintenance", "repaired", "disposed"].includes(ev.kind) && <Input label="Cost ₹" type="number" min="0" value={ev.cost} onChange={set("cost")} />}
                <Input label="Notes" value={ev.notes} onChange={set("notes")} />
                <div className="sm:col-span-2">
                  <Button type="submit">Save</Button>
                </div>
              </div>
            )}
          </form>
        )}
        <ErrorBox>{error}</ErrorBox>
        <Table head={["Date", "Event", "Details"]} empty={!a.events?.length && "No history yet."}>
          {a.events?.map((e) => (
            <tr key={e.id}>
              <td className={td}>{e.happened_on}</td>
              <td className={td}>{humanize(e.kind)}</td>
              <td className={td}>{[e.to_user_name, e.location, e.cost && inr(e.cost), e.notes].filter(Boolean).join(" · ") || "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </Modal>
  );
}

type CartLine = { item: Item; qty: number };

function Store({ onChange, onError }: Handlers) {
  const [items, setItems] = useState<Item[]>([]);
  const [heads, setHeads] = useState<{ id: number; name: string; code: string }[]>([]);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [buyer, setBuyer] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState("cash");
  const [headId, setHeadId] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    try {
      const [i, s] = await Promise.all([api.get<Item[]>(`${API}/items`, { params: { sellable_only: true } }), api.get<Sale[]>(`${API}/store/sales`, { params: { on: today } })]);
      setItems(i.data);
      setSales(s.data);
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    api.get<{ id: number; name: string; code: string }[]>("/api/v1/school/fees/heads").then((r) => setHeads(r.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(() => cart.reduce((s, l) => s + l.qty * Number(l.item.sale_price), 0), [cart]);

  function add(item: Item) {
    const cur = cart.find((l) => l.item.id === item.id);
    if (cur) setCart(cart.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l)));
    else setCart([...cart, { item, qty: 1 }]);
  }

  async function checkout() {
    setBusy(true);
    try {
      const { data } = await api.post<Sale>(`${API}/store/sales`, {
        student_id: student?.id ?? null,
        buyer_name: student ? null : buyer || null,
        payment,
        fee_head_id: payment === "add_to_fees" ? Number(headId) : null,
        lines: cart.map((l) => ({ item_id: l.item.id, qty: l.qty })),
      });
      onChange(`Bill ${data.bill_no}: ${inr(data.total)}${payment === "add_to_fees" ? " added to fees" : ` paid by ${payment}`}.`);
      setCart([]);
      setStudent(null);
      setBuyer("");
      load();
    } catch (e) {
      onError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function voidSale(s: Sale) {
    if (!window.confirm(`Void bill ${s.bill_no}? Stock goes back on the shelf.`)) return;
    try {
      await api.post(`${API}/store/sales/${s.id}/void`);
      onChange(`Bill ${s.bill_no} voided.`);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Items for sale</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-2 sm:grid-cols-2">
          {items.length === 0 && <div className="text-sm text-ink-muted">Mark items as “sold in the store” under Items & stock.</div>}
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => add(i)}
              disabled={Number(i.on_hand) <= 0}
              className="rounded-lg border border-surface-border p-3 text-left text-sm hover:border-brand-500 disabled:opacity-40"
            >
              <div className="font-medium text-ink">{i.name}</div>
              <div className="text-xs text-ink-muted">
                {inr(i.sale_price)} · {q(i.on_hand)} {i.unit} left
              </div>
            </button>
          ))}
        </CardBody>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Bill</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <StudentPicker label="Student" value={student} onChange={setStudent} />
          {!student && <Input label="…or buyer name" value={buyer} onChange={(e) => setBuyer(e.target.value)} />}
          <ul className="divide-y divide-surface-border text-sm">
            {cart.map((l) => (
              <li key={l.item.id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex-1 text-ink">{l.item.name}</span>
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded border border-surface-border bg-surface-subtle px-2 py-1 text-ink"
                  value={l.qty}
                  onChange={(e) => setCart(cart.map((x) => (x.item.id === l.item.id ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))}
                />
                <span className="w-20 text-right text-ink-muted">{inr(l.qty * Number(l.item.sale_price))}</span>
                <button className="text-ink-subtle hover:text-rose-400" onClick={() => setCart(cart.filter((x) => x.item.id !== l.item.id))} aria-label="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-base font-semibold text-ink">
            <span>Total</span>
            <span>{inr(total)}</span>
          </div>
          <Select label="Payment" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="add_to_fees" disabled={!student}>
              Add to student&apos;s fees
            </option>
          </Select>
          {payment === "add_to_fees" && (
            <Select label="Fee head" value={headId} onChange={(e) => setHeadId(e.target.value)}>
              <option value="">Select</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          )}
          <Button className="w-full" onClick={checkout} loading={busy} disabled={!cart.length || (!student && !buyer.trim()) || (payment === "add_to_fees" && !headId)}>
            Complete sale
          </Button>
        </CardBody>
      </Card>
      <Card className="lg:col-span-5">
        <CardHeader>
          <CardTitle>Today&apos;s bills</CardTitle>
        </CardHeader>
        <Table head={["Bill", "Buyer", "Items", "Total", "Payment", ""]} empty={sales.length === 0 && "No sales today."}>
          {sales.map((s) => (
            <tr key={s.id} className={s.is_void ? "opacity-50" : ""}>
              <td className="px-4 py-3 text-[12px] tabular-nums text-ink">{s.bill_no}</td>
              <td className={td}>{s.student_name ?? s.buyer_name}</td>
              <td className={td}>{s.lines.map((l) => `${l.item_name} × ${q(l.qty)}`).join(", ")}</td>
              <td className={tdStrong}>{inr(s.total)}</td>
              <td className={td}>{s.is_void ? <Badge tone="rose">void</Badge> : humanize(s.payment)}</td>
              <td className="px-4 py-3 text-right">
                {!s.is_void && (
                  <Button size="sm" variant="ghost" onClick={() => voidSale(s)}>
                    Void
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Suppliers({ onChange, onError }: Handlers) {
  const [items, setItems] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const load = () =>
    api
      .get<Supplier[]>(`${API}/suppliers`)
      .then((r) => setItems(r.data))
      .catch((e) => onError(apiError(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>+ New supplier</Button>
      </div>
      <Card>
        <Table head={["Supplier", "Contact", "GSTIN", ""]} empty={items.length === 0 && "No suppliers."}>
          {items.map((s) => (
            <tr key={s.id}>
              <td className={tdStrong}>
                {s.name} {!s.is_active && <Badge>inactive</Badge>}
              </td>
              <td className={td}>{[s.contact_person, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
              <td className={td}>{s.gstin ?? "—"}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {editing && (
        <SupplierModal
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange("Supplier saved.");
            load();
          }}
        />
      )}
    </div>
  );
}

function SupplierModal({ existing, onClose, onSaved }: { existing: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: existing?.name ?? "",
    contact_person: existing?.contact_person ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    gstin: existing?.gstin ?? "",
    address: existing?.address ?? "",
    is_active: existing?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New supplier"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? (v.trim() ? (k === "gstin" ? v.trim().toUpperCase() : v.trim()) : null) : v]));
          try {
            if (existing) await api.put(`${API}/suppliers/${existing.id}`, payload);
            else await api.post(`${API}/suppliers`, payload);
            onSaved();
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={f.name} onChange={set("name")} required />
          <Input label="Contact person" value={f.contact_person} onChange={set("contact_person")} />
          <Input label="Phone" value={f.phone} onChange={set("phone")} />
          <Input label="Email" type="email" value={f.email} onChange={set("email")} />
          <Input label="GSTIN" value={f.gstin} onChange={set("gstin")} />
          <Input label="Address" value={f.address} onChange={set("address")} />
        </div>
        {existing && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            Active
          </label>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
