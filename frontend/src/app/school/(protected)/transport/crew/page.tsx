"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Select, Table, humanize, td } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { AlertTriangle, UserCheck, UserX, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";

import { Crew, TransportTabs } from "../TransportTabs";

export default function CrewPage() {
  const [items, setItems] = useState<Crew[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [creating, setCreating] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    try {
      const { data } = await api.get<Crew[]>("/api/v1/school/transport/crew");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(c: Crew) {
    try {
      await api.patch(`/api/v1/school/transport/crew/${c.id}`, { is_active: !c.is_active });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const drivers = items.filter((c) => c.role === "driver");
  const inactive = items.filter((c) => !c.is_active);
  const expired = items.filter((c) => c.license_expiry && c.license_expiry < today);

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Transport"
        subtitle="Drivers, conductors and bus attendants."
        actions={<Button onClick={() => setCreating(true)}>+ Add person</Button>}
      />
      <TransportTabs />

      {/* Counted from the crew list already on the page, not from a second
          request. */}
      <StatStrip
        stats={[
          {
            label: "Crew",
            value: items.length,
            note: "Drivers, conductors and attendants",
            icon: Users,
          },
          {
            label: "Drivers",
            value: drivers.length,
            note: `of ${items.length} people`,
            icon: UserCheck,
          },
          {
            label: "Inactive",
            value: inactive.length,
            note: inactive.length ? "Not on the roster" : "Everybody is active",
            icon: UserX,
          },
          {
            label: "Licence expired",
            value: expired.length,
            note: expired.length ? "Checked against today" : "None expired",
            icon: AlertTriangle,
          },
        ]}
      />

      <ErrorBox>{error}</ErrorBox>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Drivers and crew</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {`${drivers.length} driver(s) · ${items.length - drivers.length} conductor(s) and attendant(s)`}
            </p>
          </div>
        </CardHeader>
        <Table head={["Name", "Role", "Phone", "Licence", "Expiry", ""]} empty={items.length === 0 && "No crew yet."}>
          {items.map((c) => (
            <tr key={c.id} className="hover:bg-surface-hover">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <PersonCell name={c.full_name} sub={c.phone} />
                  {!c.is_active && <Badge>inactive</Badge>}
                </div>
              </td>
              <td className={td}>{humanize(c.role)}</td>
              <td className={td}>{c.phone}</td>
              <td className={td}>{c.license_no ?? "—"}</td>
              <td className={`px-3 py-2 ${c.license_expiry && c.license_expiry < today ? "text-danger" : "text-ink-muted"}`}>
                {c.license_expiry ?? "—"}
              </td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(c)}>
                  {c.is_active ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${items.length} person(s) on the transport roster`}
          right={expired.length ? `${expired.length} licence(s) expired` : "Every licence in date"}
        />
      </Card>
      {(creating || editing) && (
        <CrewModal
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CrewModal({ existing, onClose, onSaved }: { existing: Crew | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: existing?.full_name ?? "",
    role: existing?.role ?? "driver",
    phone: existing?.phone ?? "",
    license_no: existing?.license_no ?? "",
    license_expiry: existing?.license_expiry ?? "",
    address: existing?.address ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      license_no: form.license_no || null,
      license_expiry: form.license_expiry || null,
      address: form.address || null,
    };
    try {
      if (existing) await api.patch(`/api/v1/school/transport/crew/${existing.id}`, payload);
      else await api.post("/api/v1/school/transport/crew", payload);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.full_name}` : "Add crew member"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name *" value={form.full_name} onChange={set("full_name")} required />
          <Select label="Role" value={form.role} onChange={set("role")}>
            <option value="driver">Driver</option>
            <option value="conductor">Conductor</option>
            <option value="attendant">Attendant</option>
          </Select>
          <Input label="Phone *" value={form.phone} onChange={set("phone")} required />
          <Input label="Licence no." value={form.license_no} onChange={set("license_no")} />
          <Input label="Licence expiry" type="date" value={form.license_expiry} onChange={set("license_expiry")} />
          <Input label="Address" value={form.address} onChange={set("address")} />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {existing ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
