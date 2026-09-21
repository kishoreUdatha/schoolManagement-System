"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Person = {
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

type Visit = {
  visit_id: number;
  pass_no: string | null;
  purpose: string;
  purpose_detail: string | null;
  host_name: string | null;
  status: string;
  expected_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

const base = "/api/v1/school/front-desk/visitors";
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

type Handlers = { onChange: (m: string) => void; onError: (m: string) => void };

/** One record per person who comes to the school, built from the gate register:
 *  repeat visits, their history, and barring someone from the site. */
export function VisitorMaster({ onChange, onError }: Handlers) {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [edit, setEdit] = useState<Person | null>(null);
  const [block, setBlock] = useState<Person | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<{ person: Person; visits: Visit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<Person[]>(base, { params: { search: search || undefined, blocked_only: blockedOnly } })
      .then((r) => setPeople(r.data))
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedOnly]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      onChange(done);
      await load();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function openHistory(p: Person) {
    try {
      const { data } = await api.get<Visit[]>(`${base}/${p.id}/visits`);
      setHistory({ person: p, visits: data });
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            load();
          }}
        >
          <Input label="Search" placeholder="Name, phone or company" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <label className="flex items-center gap-2 py-2 text-sm text-ink-muted">
          <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />
          Barred only
        </label>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={() =>
            run(async () => {
              const { data } = await api.post<{ created: number }>(`${base}/backfill`);
              onChange(`Created ${data.created} visitor records from past visits.`);
            }, "Done.")
          }
        >
          Build from past visits
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visitors</CardTitle>
        </CardHeader>
        <CardBody>
          <Table
            head={["Name", "Phone", "Company", "Visits", "Last visit", ""]}
            empty={people.length === 0 && "No visitor records yet."}
          >
            {people.map((p) => (
              <tr key={p.id} className={p.is_blocked ? "bg-danger-bg/50" : undefined}>
                <td className={tdStrong}>
                  {p.full_name}
                  {p.is_blocked && (
                    <span className="ml-2 inline-flex flex-col align-middle">
                      <Badge tone="rose">Barred</Badge>
                    </span>
                  )}
                  {p.is_blocked && p.blocked_reason && (
                    <span className="block text-xs text-ink-subtle">
                      {p.blocked_reason} — {p.blocked_by_name ?? "—"}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {p.phone}
                  {p.id_last4 && (
                    <span className="block text-xs text-ink-subtle">
                      {humanize(p.id_type)} ····{p.id_last4}
                    </span>
                  )}
                </td>
                <td className={td}>{p.company ?? "—"}</td>
                <td className={td}>{p.visits}</td>
                <td className={td}>{when(p.last_visit_at)}</td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openHistory(p)}>
                      History
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p })}>
                      Edit
                    </Button>
                    {p.is_blocked ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          run(() => api.post(`${base}/${p.id}/block`, { blocked: false }), `${p.full_name} may visit again.`)
                        }
                      >
                        Allow
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setBlock(p);
                          setReason("");
                        }}
                      >
                        Bar
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title="Visitor details">
        {edit && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const p = edit;
              const ok = await run(
                () =>
                  api.put(`${base}/${p.id}`, {
                    full_name: p.full_name,
                    phone: p.phone,
                    email: p.email || null,
                    company: p.company || null,
                    id_type: p.id_type || null,
                    id_last4: p.id_last4 || null,
                    notes: p.notes || null,
                  }),
                `${p.full_name} updated.`
              );
              if (ok) setEdit(null);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" required value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} />
              <Input label="Phone" required value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              <Input label="Email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              <Input label="Company" value={edit.company ?? ""} onChange={(e) => setEdit({ ...edit, company: e.target.value })} />
              <Input label="ID type" value={edit.id_type ?? ""} onChange={(e) => setEdit({ ...edit, id_type: e.target.value })} />
              <Input
                label="ID last 4"
                maxLength={4}
                value={edit.id_last4 ?? ""}
                onChange={(e) => setEdit({ ...edit, id_last4: e.target.value })}
              />
            </div>
            <Textarea label="Notes for the desk" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={block !== null} onClose={() => setBlock(null)} title={`Bar ${block?.full_name ?? ""}`}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!block) return;
            const p = block;
            const ok = await run(
              () => api.post(`${base}/${p.id}/block`, { blocked: true, reason }),
              `${p.full_name} will be turned away at the gate.`
            );
            if (ok) setBlock(null);
          }}
        >
          <p className="text-sm text-ink-muted">
            The desk won&apos;t be able to sign this person in until the bar is lifted. Everyone on the desk sees the reason.
          </p>
          <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBlock(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Bar from site
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={history !== null} onClose={() => setHistory(null)} title={history ? `${history.person.full_name} — visits` : ""} size="lg">
        {history && (
          <Table head={["In", "Out", "Purpose", "To meet", "Pass", "Status"]} empty={history.visits.length === 0 && "No visits recorded."}>
            {history.visits.map((v) => (
              <tr key={v.visit_id}>
                <td className={tdStrong}>{when(v.check_in_at ?? v.expected_at)}</td>
                <td className={td}>{when(v.check_out_at)}</td>
                <td className={td}>
                  {humanize(v.purpose)}
                  {v.purpose_detail && <span className="block text-xs text-ink-subtle">{v.purpose_detail}</span>}
                </td>
                <td className={td}>{v.host_name ?? "—"}</td>
                <td className={td}>{v.pass_no ?? "—"}</td>
                <td className={td}>{humanize(v.status)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Modal>
    </div>
  );
}
