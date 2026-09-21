"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Kv, SearchBox, confirmed, formText, useDebounced } from "@/features/transport/kit";
import { PURPOSES, VISIT_STATUS, type Purpose, type VisitStatus } from "./types";

const VISITORS = "/api/v1/school/front-desk/visitors";

type Visitor = {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  company: string | null;
  id_type: string | null;
  id_last4: string | null;
  notes: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  blocked_by_name: string | null;
  blocked_at: string | null;
  visits: number;
  last_visit_at: string | null;
};

type VisitorVisit = {
  visit_id: number;
  pass_no: string | null;
  purpose: Purpose;
  purpose_detail: string | null;
  host_name: string | null;
  status: VisitStatus;
  expected_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

const ID_TYPES = ["Aadhaar", "Driving licence", "PAN", "Passport", "Voter ID", "Employee ID", "Other"];

/**
 * NEW-070, live: GET /front-desk/visitors (search, blocked_only); one
 * visitor (?id=) from GET …/visitors/{id} with GET …/{id}/visits; PUT to
 * edit, POST …/{id}/block to block or unblock; POST …/visitors/backfill.
 */
export function VisitorDirectory() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const id = params.get("id");
  const [typed, setTyped] = useState("");
  const search = useDebounced(typed.trim());
  const [blockedOnly, setBlockedOnly] = useState(false);
  const list = useApi<Visitor[]>(VISITORS, { search, blocked_only: blockedOnly || undefined });
  const everyone = useApi<Visitor[]>(VISITORS);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = list.data ?? [];
  const all = everyone.data ?? [];
  const monthAgo = Date.now() - 30 * 86_400_000;
  const stats = [
    { label: "Visitors on record", value: everyone.data ? String(all.length) : "…", note: "People who have visited" },
    { label: "Repeat visitors", value: everyone.data ? String(all.filter((v) => v.visits > 1).length) : "…", note: "More than one visit" },
    { label: "Seen in 30 days", value: everyone.data ? String(all.filter((v) => v.last_visit_at && new Date(v.last_visit_at).getTime() >= monthAgo).length) : "…", note: "Last visit in the past month" },
    { label: "Blocked", value: everyone.data ? String(all.filter((v) => v.is_blocked).length) : "…", note: "Refused entry at the gate" },
  ];
  const rows: Row[] = items.map((v) => [
    { name: v.full_name, sub: v.phone },
    v.company ?? "—",
    v.id_type ? `${v.id_type}${v.id_last4 ? ` ··${v.id_last4}` : ""}` : "—",
    String(v.visits),
    v.last_visit_at ? dateTime(v.last_visit_at) : "—",
    v.is_blocked ? "Blocked" : "Allowed",
  ]);

  const select = (vid: number | null) => {
    const q = new URLSearchParams(params.toString());
    if (vid === null) q.delete("id");
    else q.set("id", String(vid));
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };

  async function backfill() {
    if (
      !confirmed(
        "Link older visits to the directory?\n\nVisits logged before the directory existed have no visitor record. This finds each one, matches it to a visitor with the same phone number, and creates a new visitor record where there is none. Visits themselves are not changed otherwise. It is safe to run more than once.",
      )
    )
      return;
    setBackfilling(true);
    setError(null);
    try {
      const r = await api.post<{ created: number }>(`${VISITORS}/backfill`);
      notify(r.created ? `${r.created} visitor record(s) created from older visits.` : "Every visit already has a visitor record.");
      list.reload();
      everyone.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search by name, phone or organisation…" />
        <select aria-label="Filter by status" value={blockedOnly ? "blocked" : ""} onChange={(e) => setBlockedOnly(e.target.value === "blocked")}>
          <option value="">All visitors</option>
          <option value="blocked">Blocked only</option>
        </select>
        <button type="button" className="btn" disabled={backfilling} onClick={backfill} title="Create visitor records for visits logged before the directory existed">
          <Icon name="users" className="sm" />
          {backfilling ? "Linking…" : "Link older visits"}
        </button>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <Panel title="Visitor directory" sub={`${items.length} visitor(s)${list.loading ? " · Loading…" : ""} · one record per phone number`} flush>
          <DataTable
            columns={["Visitor", "Organisation", "ID checked", "Visits", "Last visit", "Status"]}
            rows={rows}
            selectable={false}
            onView={(i) => select(items[i].id)}
            empty={list.loading ? "Loading visitors…" : search || blockedOnly ? "No visitors match." : "No visitors on record yet. They are added when someone is checked in."}
          />
        </Panel>
        <aside className="stack">
          {id ? (
            <VisitorCard
              id={id}
              onChanged={() => {
                list.reload();
                everyone.reload();
              }}
              onClose={() => select(null)}
            />
          ) : (
            <div className="aside-panel">
              <h3>Visitor record</h3>
              <p>Choose View on a visitor to see their visits, correct their details or block them from entry.</p>
              <div className="gap" />
              <p>A blocked visitor is refused at check-in with the reason recorded here.</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function VisitorCard({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const visitor = useApi<Visitor>(`${VISITORS}/${id}`);
  const visits = useApi<VisitorVisit[]>(`${VISITORS}/${id}/visits`);
  const [editing, setEditing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = visitor.data;

  async function run(fn: () => Promise<unknown>, done: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(done);
      visitor.reload();
      onChanged();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    run(
      () =>
        api.put(`${VISITORS}/${id}`, {
          full_name: formText(f, "full_name"),
          phone: formText(f, "phone"),
          email: formText(f, "email"),
          company: formText(f, "company"),
          id_type: formText(f, "id_type"),
          id_last4: formText(f, "id_last4"),
          notes: formText(f, "notes"),
        }),
      "Visitor details saved.",
    ).then((ok) => ok && setEditing(false));
  }

  function block(e: FormEvent<HTMLFormElement>) {
    const reason = formText(new FormData(e.currentTarget), "reason");
    run(() => api.post(`${VISITORS}/${id}/block`, { blocked: true, reason }), "Visitor blocked.").then((ok) => ok && setBlocking(false));
  }

  if (!v) {
    return (
      <div className="aside-panel">
        <h3>Visitor record</h3>
        <p>{visitor.loading ? "Loading…" : (visitor.error ?? "Visitor not found.")}</p>
      </div>
    );
  }

  return (
    <>
      <Panel
        title={v.full_name}
        sub={v.phone}
        action={<Badge>{v.is_blocked ? "Blocked" : "Allowed"}</Badge>}
      >
        <ErrorNote>{!editing && !blocking ? error : null}</ErrorNote>
        {v.is_blocked ? (
          <div className="tip warn" style={{ marginBottom: 12 }}>
            <Icon name="bell" className="sm" />
            <span>{`Blocked${v.blocked_at ? ` on ${date(v.blocked_at)}` : ""}${v.blocked_by_name ? ` by ${v.blocked_by_name}` : ""}${v.blocked_reason ? `: ${v.blocked_reason}` : "."}`}</span>
          </div>
        ) : null}
        <Kv
          rows={[
            ["Mobile", v.phone],
            ["Email", v.email ?? "—"],
            ["Organisation", v.company ?? "—"],
            ["ID checked", v.id_type ? `${v.id_type}${v.id_last4 ? ` ending ${v.id_last4}` : ""}` : "—"],
            ["Visits", String(v.visits)],
            ["Last visit", v.last_visit_at ? dateTime(v.last_visit_at) : "—"],
            ["Notes", v.notes ?? "—"],
          ]}
        />
        <div className="gap" />
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            Edit details
          </button>
          {v.is_blocked ? (
            <button type="button" className="btn" disabled={saving} onClick={() => confirmed(`Allow ${v.full_name} in again?`) && run(() => api.post(`${VISITORS}/${id}/block`, { blocked: false, reason: null }), "Visitor unblocked.")}>
              Unblock
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setBlocking(true)}>
              Block entry
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </Panel>
      <Panel title="Visit history" sub="Most recent first" flush>
        <DataTable
          columns={["Date", "Purpose", "Host", "Pass", "Status"]}
          rows={(visits.data ?? []).map((x) => [
            dateTime(x.check_in_at ?? x.expected_at),
            `${PURPOSES[x.purpose]}${x.purpose_detail ? ` · ${x.purpose_detail}` : ""}`,
            x.host_name ?? "Front office",
            x.pass_no ?? "—",
            VISIT_STATUS[x.status],
          ])}
          selectable={false}
          rowAction={false}
          empty={visits.loading ? "Loading…" : (visits.error ?? "No visits linked to this visitor.")}
        />
      </Panel>
      <Dialog
        open={editing}
        title={`Edit · ${v.full_name}`}
        onClose={() => setEditing(false)}
        onSubmit={save}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save details"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Full name" required>
            <input name="full_name" required minLength={2} maxLength={160} defaultValue={v.full_name} />
          </Field>
          <Field label="Mobile number" required>
            <input name="phone" type="tel" required minLength={6} maxLength={20} defaultValue={v.phone} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" maxLength={255} defaultValue={v.email ?? ""} />
          </Field>
          <Field label="Organisation">
            <input name="company" maxLength={160} defaultValue={v.company ?? ""} />
          </Field>
          <Field label="ID type">
            <select name="id_type" defaultValue={v.id_type ?? ""}>
              <option value="">Not checked</option>
              {[...new Set([...ID_TYPES, ...(v.id_type ? [v.id_type] : [])])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="ID last four digits">
            <input name="id_last4" maxLength={4} pattern="[0-9A-Za-z]{0,4}" defaultValue={v.id_last4 ?? ""} autoComplete="off" />
          </Field>
          <Field label="Notes" full>
            <textarea name="notes" maxLength={2000} defaultValue={v.notes ?? ""} />
          </Field>
        </div>
      </Dialog>
      <Dialog
        open={blocking}
        title={`Block ${v.full_name}`}
        onClose={() => setBlocking(false)}
        onSubmit={block}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setBlocking(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Block entry"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <p>The front desk will be stopped from checking this person in. The reason is shown to the guard at check-in.</p>
        <Field label="Reason" required full>
          <textarea name="reason" required maxLength={500} />
        </Field>
      </Dialog>
    </>
  );
}
