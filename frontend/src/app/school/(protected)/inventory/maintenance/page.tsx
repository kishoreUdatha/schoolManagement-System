"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { daysLeft, shortDate } from "@/lib/dates";

type Asset = {
  id: number;
  asset_tag: string;
  name: string;
  category: string | null;
  location: string | null;
  status: string;
  cost: string | null;
  supplier_name: string | null;
  warranty_until: string | null;
  warranty_active: boolean;
  maintenance_cost: string;
  assigned_to_name: string | null;
};
type AssetEvent = {
  id: number;
  kind: string;
  happened_on: string;
  to_user_name: string | null;
  location: string | null;
  cost: string | null;
  notes: string | null;
  recorded_by_name: string | null;
};
type AssetDetail = Asset & { events: AssetEvent[] };

const WARRANTY_SOON = 30;

/** Repairs, and the warranties that decide who pays for them.
 *
 *  There is no maintenance schedule in the data — an asset knows when its
 *  warranty ends and what has been done to it, but nothing says when it is
 *  next due a service. So this shows what is true rather than a planner that
 *  would quietly invent its own dates.
 */
export default function AssetMaintenancePage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [logging, setLogging] = useState<Asset | null>(null);
  const [form, setForm] = useState({ kind: "maintenance", happened_on: "", cost: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Asset[]>("/api/v1/school/inventory/assets")
      .then((r) => setAssets(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const openDetail = (a: Asset) =>
    api
      .get<AssetDetail>(`/api/v1/school/inventory/assets/${a.id}`)
      .then((r) => setDetail(r.data))
      .catch((e) => setError(apiError(e)));

  const inRepair = assets.filter((a) => a.status === "under_repair");
  const expiring = assets.filter((a) => {
    const d = daysLeft(a.warranty_until);
    return d !== null && d >= 0 && d <= WARRANTY_SOON;
  });
  const spent = assets.reduce((n, a) => n + Number(a.maintenance_cost || 0), 0);

  const warrantyBadge = (a: Asset) => {
    const d = daysLeft(a.warranty_until);
    if (d === null) return <span className="text-ink-subtle">Not recorded</span>;
    if (d < 0) return <Badge tone="neutral">Ended {shortDate(a.warranty_until!)}</Badge>;
    if (d <= WARRANTY_SOON)
      return <Badge tone="amber">Ends in {d} day{d === 1 ? "" : "s"}</Badge>;
    return <Badge tone="emerald">Until {shortDate(a.warranty_until!)}</Badge>;
  };

  const submit = async () => {
    if (!logging) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.post(`/api/v1/school/inventory/assets/${logging.id}/events`, {
        kind: form.kind,
        happened_on: form.happened_on || null,
        cost: form.cost === "" ? null : form.cost,
        notes: form.notes || null,
      });
      setDone(
        form.kind === "repaired"
          ? `${logging.name} is back in service.`
          : `${logging.name} logged as sent for repair.`
      );
      setLogging(null);
      setForm({ kind: "maintenance", happened_on: "", cost: "", notes: "" });
      load();
      if (detail?.id === logging.id) openDetail(logging);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset maintenance"
        subtitle="What is away being repaired, what has been spent on it, and whose warranty is about to run out."
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assets" value={assets.length} />
        <StatCard
          label="Under repair"
          value={inRepair.length}
          accent={inRepair.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Warranty ending soon"
          value={expiring.length}
          accent={expiring.length ? "amber" : "emerald"}
        />
        <StatCard label="Spent on repairs" value={inr(spent)} />
      </div>

      {expiring.length > 0 && (
        <WarnBox>
          {expiring.length} asset(s) come out of warranty within {WARRANTY_SOON} days. A
          repair booked after that date is the school&apos;s bill rather than the
          supplier&apos;s.
        </WarnBox>
      )}

      {inRepair.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Away being repaired</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Tag", "Asset", "Where it was", "Warranty", ""]}>
              {inRepair.map((a) => (
                <tr key={a.id}>
                  <td className={td}>{a.asset_tag}</td>
                  <td className={tdStrong}>{a.name}</td>
                  <td className={td}>{a.location || "—"}</td>
                  <td className={td}>{warrantyBadge(a)}</td>
                  <td className={td}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLogging(a);
                        setForm({ kind: "repaired", happened_on: "", cost: "", notes: "" });
                      }}
                    >
                      Mark repaired
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Every asset</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Tag", "Asset", "Category", "Status", "Warranty", "Repairs", ""]}
            empty={assets.length === 0 && "No assets have been added to the register yet."}
          >
            {assets.map((a) => (
              <tr key={a.id}>
                <td className={td}>{a.asset_tag}</td>
                <td className={tdStrong}>
                  {a.name}
                  {a.assigned_to_name && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      with {a.assigned_to_name}
                    </span>
                  )}
                </td>
                <td className={td}>{a.category || "—"}</td>
                <td className={td}>
                  <Badge
                    tone={
                      a.status === "under_repair"
                        ? "amber"
                        : a.status === "disposed"
                          ? "neutral"
                          : "emerald"
                    }
                  >
                    {humanize(a.status)}
                  </Badge>
                </td>
                <td className={td}>{warrantyBadge(a)}</td>
                <td className={td}>
                  {Number(a.maintenance_cost) > 0 ? inr(a.maintenance_cost) : "—"}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => openDetail(a)}>
                      History
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Log maintenance for ${a.name}`}
                      onClick={() => {
                        setLogging(a);
                        setForm({
                          kind: a.status === "under_repair" ? "repaired" : "maintenance",
                          happened_on: "",
                          cost: "",
                          notes: "",
                        });
                      }}
                    >
                      <Wrench className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        There is no service schedule on an asset, so nothing here can say when one is next
        due. Warranty end dates are what the register actually knows.
      </p>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.name} — history` : ""}
        size="lg"
      >
        {detail && (
          <Table
            head={["When", "What happened", "Cost", "Notes", "Recorded by"]}
            empty={detail.events.length === 0 && "Nothing has been recorded against this asset."}
          >
            {detail.events.map((e) => (
              <tr key={e.id}>
                <td className={td}>{shortDate(e.happened_on)}</td>
                <td className={tdStrong}>{humanize(e.kind)}</td>
                <td className={td}>{e.cost ? inr(e.cost) : "—"}</td>
                <td className={td}>{e.notes || "—"}</td>
                <td className={td}>{e.recorded_by_name || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Modal>

      <Modal
        open={logging !== null}
        onClose={() => setLogging(null)}
        title={logging ? `Log against ${logging.name}` : ""}
      >
        <div className="space-y-3">
          <Select
            label="What happened"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="maintenance">Sent for repair</option>
            <option value="repaired">Repaired and back</option>
          </Select>
          <Input
            label="When"
            type="date"
            value={form.happened_on}
            onChange={(e) => setForm({ ...form, happened_on: e.target.value })}
            hint="Leave blank for today."
          />
          <Input
            label="Cost"
            type="number"
            min={0}
            step="0.01"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
            hint={
              logging && logging.warranty_active
                ? "Still under warranty — the supplier may be paying."
                : undefined
            }
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogging(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
