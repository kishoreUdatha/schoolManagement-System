"use client";

import { FormEvent, useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Visit = {
  id: number;
  visitor_name: string;
  phone: string;
  company: string | null;
  purpose: string;
  purpose_detail: string | null;
  host_name: string | null;
  student_name: string | null;
  people_count: number;
  vehicle_no: string | null;
  status: "expected" | "checked_in" | "checked_out" | "denied" | "cancelled";
  expected_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  pass_no: string | null;
  minutes_inside: number | null;
};

type GatePass = {
  id: number;
  student_name: string;
  section_label: string | null;
  leave_on: string;
  leave_time: string | null;
  reason: string;
  pickup_name: string;
  pickup_relation: string | null;
  pickup_phone: string | null;
  code: string | null;
  status: "requested" | "approved" | "rejected" | "departed" | "cancelled";
  requested_by_name: string | null;
  requested_by_parent: boolean;
  departed_at: string | null;
};

type Incident = {
  id: number;
  occurred_at: string;
  location: string | null;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  action_taken: string | null;
  is_closed: boolean;
  reported_by_name: string | null;
};

type Dash = {
  inside_now: number;
  visitors_today: number;
  expected_today: number;
  gate_passes_today: number;
  gate_passes_pending: number;
  open_incidents: number;
};

const PURPOSES = ["meeting", "parent_visit", "admission_enquiry", "delivery", "vendor", "interview", "event", "maintenance", "other"];
const base = "/api/v1/school/front-desk";
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

/** Reception & gate. `office` = school admin/principal (approve passes, create passes, close incidents). */
export function FrontDesk({ office }: { office: boolean }) {
  const [tab, setTab] = useState<"visitors" | "passes" | "incidents">("visitors");
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDash = () =>
    api
      .get<Dash>(`${base}/dashboard`)
      .then((r) => setDash(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    loadDash();
  }, []);

  const flash = (m: string) => {
    setNotice(m);
    setError(null);
    loadDash();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Front desk" subtitle="Visitors, early pickups at the gate, and security incidents." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {dash && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Inside now" value={dash.inside_now} />
          <StatCard label="Visitors today" value={dash.visitors_today} />
          <StatCard label="Expected" value={dash.expected_today} />
          <StatCard label="Early pickups" value={dash.gate_passes_today} />
          <StatCard label="To approve" value={dash.gate_passes_pending} accent={dash.gate_passes_pending ? "amber" : "brand"} />
          <StatCard label="Open incidents" value={dash.open_incidents} accent={dash.open_incidents ? "rose" : "brand"} />
        </div>
      )}
      <nav className="flex gap-1 border-b border-surface-border">
        {(["visitors", "passes", "incidents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t === "visitors" ? "Visitors" : t === "passes" ? "Early pickup" : "Incidents"}
          </button>
        ))}
      </nav>
      {tab === "visitors" && <Visitors onChange={flash} onError={setError} />}
      {tab === "passes" && <Passes office={office} onChange={flash} onError={setError} />}
      {tab === "incidents" && <Incidents office={office} onChange={flash} onError={setError} />}
    </div>
  );
}

type Handlers = { onChange: (m: string) => void; onError: (m: string) => void };

function Visitors({ onChange, onError }: Handlers) {
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Visit[]>([]);
  const [open, setOpen] = useState<"walkin" | "expected" | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Visit[]>(`${base}/visits`, { params: { on: day, q: q || undefined } });
      setItems(data);
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  async function act(v: Visit, path: string, msg: string) {
    try {
      await api.post(`${base}/visits/${v.id}/${path}`, path === "deny" || path === "cancel" ? {} : undefined);
      onChange(msg);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Input label="Date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <Input label="Search" placeholder="Name, phone, pass, vehicle" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOpen("expected")}>
            Expect a visitor
          </Button>
          <Button onClick={() => setOpen("walkin")}>+ Check in visitor</Button>
        </div>
      </div>
      <Card>
        <Table head={["Visitor", "Purpose", "To meet", "In", "Out", "Pass", ""]} empty={items.length === 0 && "No visitors for this day."}>
          {items.map((v) => (
            <tr key={v.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                {v.visitor_name}
                {v.people_count > 1 && ` +${v.people_count - 1}`}
                <div className="text-xs font-normal text-ink-subtle">
                  {v.phone}
                  {v.company && ` · ${v.company}`}
                  {v.vehicle_no && ` · ${v.vehicle_no}`}
                </div>
              </td>
              <td className={td}>
                {humanize(v.purpose)}
                {v.purpose_detail && <div className="text-xs text-ink-subtle">{v.purpose_detail}</div>}
              </td>
              <td className={td}>{v.host_name ?? v.student_name ?? "—"}</td>
              <td className={td}>{v.status === "expected" ? <Badge tone="amber">expected {time(v.expected_at)}</Badge> : time(v.check_in_at)}</td>
              <td className={td}>
                {v.status === "checked_in" ? <Badge tone="brand">inside · {v.minutes_inside}m</Badge> : v.status === "checked_out" ? time(v.check_out_at) : <Badge>{v.status}</Badge>}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-ink">{v.pass_no ?? "—"}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {v.status === "expected" && (
                  <>
                    <Button size="sm" onClick={() => act(v, "check-in", `${v.visitor_name} checked in.`)}>
                      Check in
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(v, "deny", `${v.visitor_name} denied entry.`)}>
                      Deny
                    </Button>
                  </>
                )}
                {v.status === "checked_in" && (
                  <Button size="sm" variant="secondary" onClick={() => act(v, "check-out", `${v.visitor_name} checked out.`)}>
                    Check out
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {open && (
        <VisitModal
          expected={open === "expected"}
          onClose={() => setOpen(null)}
          onSaved={(v) => {
            setOpen(null);
            onChange(v.pass_no ? `${v.visitor_name} checked in. Pass ${v.pass_no}.` : `${v.visitor_name} expected.`);
            load();
          }}
        />
      )}
    </div>
  );
}

function VisitModal({ expected, onClose, onSaved }: { expected: boolean; onClose: () => void; onSaved: (v: Visit) => void }) {
  const [staff, setStaff] = useState<{ user_id: number; full_name: string }[]>([]);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [form, setForm] = useState({
    visitor_name: "",
    phone: "",
    id_type: "",
    id_number: "",
    company: "",
    purpose: "meeting",
    purpose_detail: "",
    host_user_id: "",
    people_count: "1",
    vehicle_no: "",
    expected_at: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api.get<{ user_id: number; full_name: string }[]>("/api/v1/school/directory/staff").then((r) => setStaff(r.data)).catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = (v: string) => (v.trim() ? v.trim() : null);
    try {
      const { data } = await api.post<Visit>(`${base}/visits`, {
        visitor_name: form.visitor_name,
        phone: form.phone,
        id_type: n(form.id_type),
        id_number: n(form.id_number),
        company: n(form.company),
        purpose: form.purpose,
        purpose_detail: n(form.purpose_detail),
        host_user_id: form.host_user_id ? Number(form.host_user_id) : null,
        student_id: student?.id ?? null,
        people_count: Number(form.people_count || 1),
        vehicle_no: n(form.vehicle_no),
        expected_at: expected && form.expected_at ? new Date(form.expected_at).toISOString() : null,
      });
      onSaved(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={expected ? "Expect a visitor" : "Check in visitor"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Name *" value={form.visitor_name} onChange={set("visitor_name")} required />
          <Input label="Phone *" value={form.phone} onChange={set("phone")} required />
          <Input label="Company / from" value={form.company} onChange={set("company")} />
          <Select label="Purpose" value={form.purpose} onChange={set("purpose")}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Input label="Details" value={form.purpose_detail} onChange={set("purpose_detail")} />
          </div>
          <Select label="To meet (staff)" value={form.host_user_id} onChange={set("host_user_id")}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <StudentPicker label="Related student (parent visits)" value={student} onChange={setStudent} />
          </div>
          <Select label="ID shown" value={form.id_type} onChange={set("id_type")}>
            <option value="">None</option>
            {["Aadhaar", "Driving licence", "PAN", "Voter ID", "Passport", "Company ID"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
          <Input label="ID number" value={form.id_number} onChange={set("id_number")} hint="Only the last 4 digits are saved" />
          <Input label="Vehicle no." value={form.vehicle_no} onChange={set("vehicle_no")} />
          <Input label="People" type="number" min="1" value={form.people_count} onChange={set("people_count")} />
          {expected && <Input label="Expected at *" type="datetime-local" value={form.expected_at} onChange={set("expected_at")} required />}
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {expected ? "Save" : "Check in & issue pass"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Passes({ office, onChange, onError }: Handlers & { office: boolean }) {
  const [items, setItems] = useState<GatePass[]>([]);
  const [pending, setPending] = useState<GatePass[]>([]);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<GatePass | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [today, p] = await Promise.all([
        api.get<GatePass[]>(`${base}/gate-passes`),
        office ? api.get<GatePass[]>(`${base}/gate-passes`, { params: { pending_only: true } }) : Promise.resolve({ data: [] as GatePass[] }),
      ]);
      setItems(today.data);
      setPending(p.data);
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setFound(null);
    try {
      const { data } = await api.post<GatePass>(`${base}/gate-passes/verify`, { code });
      setFound(data);
    } catch (err) {
      onError(apiError(err));
    }
  }

  async function release(g: GatePass) {
    try {
      await api.post(`${base}/gate-passes/${g.id}/release`);
      setFound(null);
      setCode("");
      onChange(`${g.student_name} released to ${g.pickup_name}. Parents notified.`);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  async function decide(g: GatePass, approve: boolean) {
    const note = approve ? null : window.prompt("Reason for the parent?");
    if (!approve && !note) return;
    try {
      await api.post(`${base}/gate-passes/${g.id}/decide`, { approve, note });
      onChange(approve ? `Approved; the code was sent to ${g.student_name}'s parents.` : "Rejected.");
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>At the gate</CardTitle>
          {office && (
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              + Issue pass
            </Button>
          )}
        </CardHeader>
        <CardBody className="space-y-3">
          <form onSubmit={verify} className="flex flex-wrap items-end gap-3">
            <Input label="Code shown by the person collecting" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <Button type="submit" disabled={code.length !== 6}>
              Verify
            </Button>
          </form>
          {found && (
            <div className="rounded-lg border border-surface-border p-4 text-sm">
              <div className="text-lg font-semibold text-ink">{found.student_name}</div>
              <div className="text-ink-muted">{found.section_label}</div>
              <div className="mt-2 text-ink">
                To be collected by <b>{found.pickup_name}</b>
                {found.pickup_relation && ` (${found.pickup_relation})`}
                {found.pickup_phone && ` · ${found.pickup_phone}`}
              </div>
              <div className="text-ink-muted">Reason: {found.reason}</div>
              {found.status === "departed" ? (
                <Badge tone="rose">already left at {time(found.departed_at)}</Badge>
              ) : (
                <Button className="mt-3" onClick={() => release(found)}>
                  Check ID & release
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {office && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Requests from parents · {pending.length}</CardTitle>
          </CardHeader>
          <Table head={["Student", "Date", "Collected by", "Reason", ""]}>
            {pending.map((g) => (
              <tr key={g.id}>
                <td className={tdStrong}>
                  {g.student_name}
                  <div className="text-xs font-normal text-ink-subtle">{g.section_label}</div>
                </td>
                <td className={td}>
                  {g.leave_on} {g.leave_time}
                </td>
                <td className={td}>
                  {g.pickup_name}
                  {g.pickup_relation && ` (${g.pickup_relation})`}
                </td>
                <td className={td}>{g.reason}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  <Button size="sm" onClick={() => decide(g, true)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(g, false)}>
                    Reject
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s early pickups</CardTitle>
        </CardHeader>
        <Table head={["Student", "Time", "Collected by", "Reason", "Status", office ? "Code" : ""]} empty={items.length === 0 && "None today."}>
          {items.map((g) => (
            <tr key={g.id}>
              <td className={tdStrong}>
                {g.student_name}
                <div className="text-xs font-normal text-ink-subtle">{g.section_label}</div>
              </td>
              <td className={td}>{g.leave_time ?? "—"}</td>
              <td className={td}>{g.pickup_name}</td>
              <td className={td}>{g.reason}</td>
              <td className="px-3 py-2">
                <Badge tone={g.status === "departed" ? "emerald" : g.status === "approved" ? "brand" : g.status === "requested" ? "amber" : "neutral"}>
                  {g.status === "departed" ? `left ${time(g.departed_at)}` : g.status}
                </Badge>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-ink">{g.code ?? ""}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {creating && (
        <PassModal
          onClose={() => setCreating(false)}
          onSaved={(g) => {
            setCreating(false);
            onChange(`Pass issued for ${g.student_name}. Code ${g.code} sent to parents.`);
            load();
          }}
        />
      )}
    </div>
  );
}

function PassModal({ onClose, onSaved }: { onClose: () => void; onSaved: (g: GatePass) => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [form, setForm] = useState({
    leave_on: new Date().toISOString().slice(0, 10),
    leave_time: "",
    reason: "",
    pickup_name: "",
    pickup_relation: "",
    pickup_phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Issue early-pickup pass">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!student) return;
          try {
            const n = (v: string) => (v.trim() ? v.trim() : null);
            const { data } = await api.post<GatePass>(`${base}/gate-passes`, {
              student_id: student.id,
              leave_on: form.leave_on,
              leave_time: n(form.leave_time),
              reason: form.reason,
              pickup_name: form.pickup_name,
              pickup_relation: n(form.pickup_relation),
              pickup_phone: n(form.pickup_phone),
            });
            onSaved(data);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <StudentPicker value={student} onChange={setStudent} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Date *" type="date" value={form.leave_on} onChange={set("leave_on")} required />
          <Input label="Time" type="time" value={form.leave_time} onChange={set("leave_time")} />
          <Input label="Collected by *" value={form.pickup_name} onChange={set("pickup_name")} required />
          <Input label="Relation" value={form.pickup_relation} onChange={set("pickup_relation")} />
          <Input label="Their phone" value={form.pickup_phone} onChange={set("pickup_phone")} />
        </div>
        <Input label="Reason *" value={form.reason} onChange={set("reason")} required />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!student}>
            Issue
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Incidents({ office, onChange, onError }: Handlers & { office: boolean }) {
  const [items, setItems] = useState<Incident[]>([]);
  const [form, setForm] = useState({ occurred_at: "", location: "", category: "", severity: "low", description: "" });

  async function load() {
    try {
      const { data } = await api.get<Incident[]>(`${base}/incidents`);
      setItems(data);
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function report(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`${base}/incidents`, {
        ...form,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
        location: form.location || null,
      });
      setForm({ occurred_at: "", location: "", category: "", severity: "low", description: "" });
      onChange("Incident logged.");
      load();
    } catch (err) {
      onError(apiError(err));
    }
  }

  async function close(i: Incident) {
    const action = window.prompt("Action taken?", i.action_taken ?? "");
    if (action === null) return;
    try {
      await api.patch(`${base}/incidents/${i.id}`, { action_taken: action, is_closed: true });
      onChange("Incident closed.");
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const sevTone = { low: "neutral", medium: "amber", high: "rose" } as const;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Log an incident</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={report} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="When" type="datetime-local" value={form.occurred_at} onChange={set("occurred_at")} />
              <Input label="Where" value={form.location} onChange={set("location")} />
              <Input label="What kind *" placeholder="e.g. Unauthorised entry" value={form.category} onChange={set("category")} required />
              <Select label="Severity" value={form.severity} onChange={set("severity")}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <Textarea label="What happened *" value={form.description} onChange={set("description")} required minLength={5} />
            <Button type="submit">Log incident</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <Table head={["When", "What", "Where", "Severity", "Reported by", ""]} empty={items.length === 0 && "No incidents."}>
          {items.map((i) => (
            <tr key={i.id}>
              <td className={td}>{new Date(i.occurred_at).toLocaleString()}</td>
              <td className={tdStrong}>
                {i.category}
                <div className="max-w-md text-xs font-normal text-ink-subtle">{i.description}</div>
                {i.action_taken && <div className="text-xs font-normal text-emerald-500">Action: {i.action_taken}</div>}
              </td>
              <td className={td}>{i.location ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge tone={sevTone[i.severity]}>{i.severity}</Badge>
              </td>
              <td className={td}>{i.reported_by_name ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                {i.is_closed ? <Badge tone="emerald">closed</Badge> : office && (
                  <Button size="sm" variant="secondary" onClick={() => close(i)}>
                    Close
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
