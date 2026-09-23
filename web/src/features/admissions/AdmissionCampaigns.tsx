"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useOnAction } from "./shared";
import { SOURCES, type Campaign } from "./types";

import { ask } from "@/lib/dialog";
const BASE = "/api/v1/school/admissions/campaigns";

function dates(c: Campaign): string {
  if (!c.start_date && !c.end_date) return "Open-ended";
  return `${date(c.start_date)} – ${c.end_date ? date(c.end_date) : "ongoing"}`;
}

/**
 * NEW-002, live: GET /admissions/campaigns (every campaign, active or not);
 * POST to add, PATCH /campaigns/{id} to edit or switch off, DELETE to remove.
 * Enquiries keep their data when a campaign is deleted (the link is cleared).
 */
export function AdmissionCampaigns() {
  const list = useApi<Campaign[]>(BASE);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState("");
  const [channel, setChannel] = useState("");
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useOnAction("new-campaign", useCallback(() => setEditing("new"), []));

  const all = list.data ?? [];
  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return all.filter(
      (c) =>
        (!state || (state === "active") === c.is_active) &&
        (!channel || c.channel === channel) &&
        (!q || [c.name, c.description].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [all, typed, state, channel]);

  const enquiries = all.reduce((n, c) => n + c.enquiry_count, 0);
  const enrolled = all.reduce((n, c) => n + c.enrolled_count, 0);
  const spend = all.reduce((n, c) => n + (Number(c.budget) || 0), 0);
  const ready = list.data !== null;
  const n = (v: number) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Campaigns", value: n(all.length), note: `${all.filter((c) => c.is_active).length} active` },
    { label: "Enquiries", value: n(enquiries), note: "Tagged to a campaign" },
    { label: "Enrolled", value: n(enrolled), note: enquiries ? `${((enrolled / enquiries) * 100).toFixed(1)}% of campaign enquiries` : "From campaign enquiries" },
    { label: "Budget", value: ready ? money(spend) : "…", note: enrolled && spend ? `${money(Math.round(spend / enrolled))} per enrolment` : "Across all campaigns" },
  ];

  const rows: Row[] = items.map((c) => [
    { name: c.name, sub: c.description ?? undefined },
    label(c.channel),
    dates(c),
    c.budget ? money(c.budget) : "—",
    String(c.enquiry_count),
    String(c.enrolled_count),
    c.is_active ? "Active" : "Inactive",
  ]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      list.reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(ev: FormEvent<HTMLFormElement>) {
    const f = new FormData(ev.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const body = {
      name: text("name"),
      channel: text("channel") ?? "campaign",
      start_date: text("start_date"),
      end_date: text("end_date"),
      budget: text("budget"),
      description: text("description"),
    };
    const ok =
      editing === "new"
        ? await act(() => api.post(BASE, body), `Campaign ${body.name} added.`)
        : editing
          ? await act(() => api.patch(`${BASE}/${editing.id}`, { ...body, is_active: f.get("is_active") === "on" }), "Campaign saved.")
          : false;
    if (ok) setEditing(null);
  }

  const remove = async (c: Campaign) => {
    const msg = c.enquiry_count
      ? `Delete ${c.name}? Its ${c.enquiry_count} enquir${c.enquiry_count === 1 ? "y keeps" : "ies keep"} their details but lose the campaign tag.`
      : `Delete ${c.name}?`;
    if ((await ask(msg))) act(() => api.delete(`${BASE}/${c.id}`), "Campaign deleted.");
  };

  const current = editing && editing !== "new" ? editing : null;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" />
        </div>
        <select aria-label="Filter by channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{editing ? null : (error ?? list.error)}</ErrorNote>
      <Panel title="Admission campaigns" sub={`Where enquiries come from, and what each campaign brought in${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Campaign", "Channel", "Dates", "Budget", "Enquiries", "Enrolled", "Status"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => setEditing(items[i])}>
                Edit
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => remove(items[i])}>
                Delete
              </button>
            </>
          )}
          empty={list.loading ? "Loading campaigns…" : typed || state || channel ? "No campaign matches these filters." : undefined}
          emptyState={{
            title: "No campaigns yet",
            note: "A campaign tags enquiries by where they came from, so you can see which channel brings in admissions.",
            action: (
              <button type="button" className="btn primary" onClick={() => setEditing("new")}>
                <Icon name="plus" className="sm" />
                New campaign
              </button>
            ),
          }}
        />
      </Panel>

      <Dialog
        open={editing !== null}
        title={current ? `Edit ${current.name}` : "New campaign"}
        onClose={() => setEditing(null)}
        onSubmit={save}
        wide
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : current ? "Save campaign" : "Add campaign"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid" key={current?.id ?? "new"}>
          <label className="field full">
            <span>
              Campaign name
              <span className="req">*</span>
            </span>
            <input name="name" required minLength={1} maxLength={160} defaultValue={current?.name} placeholder="e.g. Summer open house 2026" />
          </label>
          <label className="field">
            <span>Channel</span>
            <select name="channel" defaultValue={current?.channel ?? "campaign"}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Budget (₹)</span>
            <input name="budget" type="number" min={0} step="0.01" defaultValue={current?.budget ?? ""} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Starts on</span>
            <input name="start_date" type="date" defaultValue={current?.start_date ?? ""} />
          </label>
          <label className="field">
            <span>Ends on</span>
            <input name="end_date" type="date" defaultValue={current?.end_date ?? ""} />
          </label>
          <label className="field full">
            <span>Description</span>
            <textarea name="description" maxLength={2000} defaultValue={current?.description ?? ""} placeholder="Where it runs and who it reaches" />
          </label>
          {current ? (
            <label className="field full">
              <span>Status</span>
              <span className="row">
                <input type="checkbox" name="is_active" defaultChecked={current.is_active} /> Active: listed on the enquiry form
              </span>
            </label>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
