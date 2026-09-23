"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { AssetDetailDialog } from "./AssetDialogs";
import { ASSET_STATUS, Field, INV, Modal, Tip, daysUntil, useNewFlag, type Asset } from "./common";

const SOON = 30;
const OPS = "/api/v1/school/ops/assets";

/** GET /school/ops/assets/service-due */
type ServiceRow = {
  asset_id: number;
  asset_tag: string;
  name: string;
  location: string | null;
  status: string;
  last_serviced_on: string | null;
  service_every_days: number | null;
  service_due_on: string | null;
  service_overdue: boolean;
  warranty_until: string | null;
  warranty_expired: boolean;
};
type ServiceDue = { within_days: number; assets: ServiceRow[]; count: number; overdue: number; no_interval_set: number };

function nextService(r: ServiceRow): string {
  if (!r.service_every_days) return "No interval set";
  if (!r.service_due_on) return "No purchase or service date to count from";
  const d = daysUntil(r.service_due_on);
  if (d === null) return date(r.service_due_on);
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? "" : "s"} (${date(r.service_due_on)})`;
  return d === 0 ? "Due today" : `In ${d} day${d === 1 ? "" : "s"} (${date(r.service_due_on)})`;
}

function warranty(a: Asset): string {
  const d = daysUntil(a.warranty_until);
  if (d === null) return "Not recorded";
  if (d < 0) return `Ended ${date(a.warranty_until)}`;
  if (d <= SOON) return `Ends in ${d} day${d === 1 ? "" : "s"}`;
  return `Until ${date(a.warranty_until)}`;
}

/**
 * SCR-241, live: GET /inventory/assets with repair spend and warranty, and
 * repairs logged as asset events (maintenance / repaired). The service
 * schedule is GET /ops/assets/service-due (an interval per asset, counted
 * from the last maintenance or repaired event), set with
 * PUT /ops/assets/{id}/service-interval. The figures on top read the
 * unfiltered asset list, so they hold whatever the status filter says.
 */
export function AssetMaintenance() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [choosing, closeChoose] = useNewFlag();
  const list = useApi<Asset[]>(`${INV}/assets`, { status: status === "soon" ? "" : status });
  const every = useApi<Asset[]>(`${INV}/assets`);
  const [within, setWithin] = useState(60);
  const due = useApi<ServiceDue>(`${OPS}/service-due`, { within_days: within });
  const [intervalForm, setIntervalForm] = useState<{ assetId: number | null; days: string } | null>(null);
  const [savingInterval, setSavingInterval] = useState(false);
  const [intervalError, setIntervalError] = useState<string | null>(null);

  function openInterval(assetId: number | null, days: number | null) {
    setIntervalError(null);
    setIntervalForm({ assetId, days: days ? String(days) : "" });
  }

  async function saveInterval() {
    if (!intervalForm?.assetId) {
      setIntervalError("Choose an asset.");
      return;
    }
    const days = intervalForm.days.trim() ? Number(intervalForm.days) : null;
    setSavingInterval(true);
    setIntervalError(null);
    try {
      await api.put(`${OPS}/${intervalForm.assetId}/service-interval`, { service_every_days: days });
      notify(days ? `Service every ${days} days saved.` : "Service interval cleared.");
      setIntervalForm(null);
      due.reload();
    } catch (err) {
      setIntervalError(errorText(err));
    } finally {
      setSavingInterval(false);
    }
  }

  const s = search.trim().toLowerCase();
  const all = list.data ?? [];
  const shown = all
    .filter((a) => !s || [a.name, a.asset_tag, a.location, a.category].some((v) => v?.toLowerCase().includes(s)))
    .filter((a) => {
      if (status !== "soon") return true;
      const d = daysUntil(a.warranty_until);
      return d !== null && d >= 0 && d <= SOON;
    })
    // What is away being repaired comes first.
    .sort((a, b) => Number(b.status === "under_repair") - Number(a.status === "under_repair"));
  const expiring = all.filter((a) => {
    const d = daysUntil(a.warranty_until);
    return d !== null && d >= 0 && d <= SOON;
  });
  const inRepair = all.filter((a) => a.status === "under_repair").length;
  const spent = all.reduce((n, a) => n + Number(a.maintenance_cost || 0), 0);
  const register = every.data ?? [];
  const ending = register.filter((a) => {
    const d = daysUntil(a.warranty_until);
    return d !== null && d >= 0 && d <= SOON;
  });
  const n = (v: number, ready: unknown) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Under repair", value: n(register.filter((a) => a.status === "under_repair").length, every.data), note: "Away being fixed" },
    { label: "Service overdue", value: n(due.data?.overdue ?? 0, due.data), note: "Past the service date" },
    { label: "Warranty ending", value: n(ending.length, every.data), note: `Within ${SOON} days` },
    { label: "Repair spend", value: every.data ? money(register.reduce((s, a) => s + Number(a.maintenance_cost || 0), 0)) : "…", note: "On all assets so far" },
  ];

  // "Issue" is the fault given when it was last sent for repair, until it is
  // marked repaired. The "Due date" lives in the service schedule panel below.
  const rows: Row[] = shown.map((a) => [
    { name: a.name, sub: a.asset_tag },
    a.open_issue ? { name: a.open_issue, sub: a.issue_reported_on ? `Reported ${date(a.issue_reported_on)}` : undefined } : "—",
    a.location ?? "—",
    Number(a.maintenance_cost) > 0 ? money(a.maintenance_cost) : "—",
    a.assigned_to_name ?? "—",
    warranty(a),
    ASSET_STATUS[a.status],
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset maintenance…" aria-label="Search assets" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses (not disposed)</option>
          <option value="under_repair">Under repair</option>
          <option value="in_use">In use</option>
          <option value="in_store">In store</option>
          <option value="soon">{`Warranty ending within ${SOON} days`}</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {expiring.length ? (
        <Tip warn>{`${expiring.length} asset(s) come out of warranty within ${SOON} days. A repair booked after that date is the school's bill rather than the supplier's.`}</Tip>
      ) : null}
      <Panel title="Records" sub={`${inRepair} under repair · ${money(spent)} spent on repairs so far${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Asset", "Issue", "Location", "Spent on repairs", "Assigned to", "Warranty", "Status"]}
          rows={rows}
          onView={(i) => setOpen(shown[i].id)}
          empty={list.loading ? "Loading assets…" : s || status ? "No assets match these filters." : undefined}
          emptyState={{
            title: "No assets yet",
            note: "Repairs, servicing and warranty dates are tracked against assets on the register — add one there first.",
          }}
        />
      </Panel>
      <div className="gap" />
      <ErrorNote>{due.error}</ErrorNote>
      <Panel
        title="Service schedule"
        sub={
          due.data
            ? `${due.data.count} asset(s) with a service or warranty date within ${within} days · ${due.data.overdue} overdue · ${due.data.no_interval_set} without an interval`
            : due.loading
              ? "Loading…"
              : "Servicing and warranty dates"
        }
        action={
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Look ahead" value={within} onChange={(e) => setWithin(Number(e.target.value))}>
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>{`Next ${d} days`}</option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => openInterval(null, null)}>
              <Icon name="clock" className="sm" />
              Set service interval
            </button>
          </div>
        }
        flush
      >
        <DataTable
          columns={["Asset", "Location", "Service every", "Last serviced", "Next service", "Warranty"]}
          rows={(due.data?.assets ?? []).map((r) => [
            { name: r.name, sub: r.asset_tag },
            r.location ?? "—",
            r.service_every_days ? `${r.service_every_days} days` : "—",
            date(r.last_serviced_on),
            nextService(r),
            r.warranty_until ? `${r.warranty_expired ? "Ended" : "Until"} ${date(r.warranty_until)}` : "Not recorded",
          ])}
          selectable={false}
          actions={(i) => {
            const r = due.data!.assets[i];
            return (
              <>
                <button type="button" className="btn" onClick={() => openInterval(r.asset_id, r.service_every_days)}>
                  Interval
                </button>
                <button type="button" className="btn" onClick={() => setOpen(r.asset_id)}>
                  Log service
                </button>
              </>
            );
          }}
          empty={due.loading ? "Loading the schedule…" : `No service or warranty date falls within ${within} days.`}
        />
      </Panel>
      <Tip>An asset joins the schedule once it has a service interval (counted from its last maintenance or repair, else its purchase date) or a warranty end date. Logging maintenance restarts the count.</Tip>
      {intervalForm ? (
        <Dialog
          open
          title="Service interval"
          onClose={() => setIntervalForm(null)}
          onSubmit={saveInterval}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setIntervalForm(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={savingInterval}>
                <Icon name="check" className="sm" />
                {savingInterval ? "Saving…" : "Save interval"}
              </button>
            </>
          }
        >
          <ErrorNote>{intervalError}</ErrorNote>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <Field label="Asset" required>
              <select value={intervalForm.assetId ?? ""} required onChange={(e) => setIntervalForm((x) => x && { ...x, assetId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Choose an asset</option>
                {all
                  .filter((a) => a.status !== "disposed")
                  .map((a) => (
                    <option key={a.id} value={a.id}>{`${a.asset_tag} · ${a.name}`}</option>
                  ))}
              </select>
            </Field>
            <Field label="Service every (days)">
              <input type="number" min={1} max={3650} value={intervalForm.days} onChange={(e) => setIntervalForm((x) => x && { ...x, days: e.target.value })} placeholder="Blank: no regular service" />
            </Field>
          </div>
        </Dialog>
      ) : null}
      {choosing ? (
        <Modal title="Log maintenance" onClose={closeChoose}>
          <Field label="Asset" required>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                setOpen(Number(e.target.value));
                closeChoose();
              }}
            >
              <option value="">Choose an asset</option>
              {all
                .filter((a) => a.status !== "disposed")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.asset_tag} · ${a.name} (${ASSET_STATUS[a.status]})`}
                  </option>
                ))}
            </select>
          </Field>
        </Modal>
      ) : null}
      {open !== null ? (
        <AssetDetailDialog
          assetId={open}
          only={["maintenance", "repaired"]}
          onClose={() => setOpen(null)}
          onChanged={() => {
            list.reload();
            due.reload();
          }}
        />
      ) : null}
    </>
  );
}
