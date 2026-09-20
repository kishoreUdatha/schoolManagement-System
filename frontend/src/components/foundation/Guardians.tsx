"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export type Guardian = {
  guardian_id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  relation: string;
  is_primary: boolean;
  can_pickup: boolean;
  is_emergency_contact: boolean;
  lives_with_student: boolean;
  has_portal_login: boolean;
};

const RELATIONS = ["father", "mother", "guardian", "grandparent", "uncle", "aunt", "sibling", "driver", "other"];

/** Family contacts for one student. `mode="school"` = full control; `mode="parent"` = add/remove pickup people. */
export function Guardians({ base, mode }: { base: string; mode: "school" | "parent" }) {
  const [items, setItems] = useState<Guardian[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () =>
    api
      .get<Guardian[]>(base)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function patch(g: Guardian, body: Partial<Guardian>) {
    try {
      const { data } = await api.patch<Guardian[]>(`${base}/${g.guardian_id}`, body);
      setItems(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove(g: Guardian) {
    if (!window.confirm(`Remove ${g.full_name}?`)) return;
    try {
      await api.delete(`${base}/${g.guardian_id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function grant(g: Guardian) {
    try {
      const { data } = await api.post<{ email: string; temporary_password: string }>(`${base}/${g.guardian_id}/portal-access`);
      setNotice(`Login created for ${data.email}. Temporary password: ${data.temporary_password} (shown once).`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "school" ? "Guardians & pickup" : "Family & people allowed to collect"}</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}>
          {mode === "school" ? "+ Add guardian" : "+ Add pickup person"}
        </Button>
      </CardHeader>
      <CardBody className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <NoticeBox>{notice}</NoticeBox>
        <Table head={["Name", "Relation", "Contact", "Can collect", mode === "school" ? "Emergency" : "", ""]} empty={items.length === 0 && "No guardians recorded."}>
          {items.map((g) => (
            <tr key={g.guardian_id}>
              <td className={tdStrong}>
                {g.full_name} {g.is_primary && <Badge tone="brand">primary</Badge>} {g.has_portal_login && <Badge tone="emerald">portal</Badge>}
                {g.occupation && <div className="text-xs font-normal text-ink-subtle">{g.occupation}</div>}
              </td>
              <td className={td}>{humanize(g.relation)}</td>
              <td className={td}>
                {g.phone ?? "—"}
                {g.email && <div className="text-xs text-ink-subtle">{g.email}</div>}
              </td>
              <td className="px-4 py-3">
                {mode === "school" ? (
                  <input type="checkbox" checked={g.can_pickup} onChange={(e) => patch(g, { can_pickup: e.target.checked })} aria-label="Can collect" />
                ) : g.can_pickup ? (
                  <Badge tone="emerald">yes</Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                {mode === "school" && (
                  <input
                    type="checkbox"
                    checked={g.is_emergency_contact}
                    onChange={(e) => patch(g, { is_emergency_contact: e.target.checked })}
                    aria-label="Emergency contact"
                  />
                )}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {mode === "school" && !g.is_primary && (
                  <Button size="sm" variant="ghost" onClick={() => patch(g, { is_primary: true })}>
                    Make primary
                  </Button>
                )}
                {mode === "school" && !g.has_portal_login && (
                  <Button size="sm" variant="secondary" onClick={() => grant(g)} disabled={!g.email} title={g.email ? "" : "Add an email first"}>
                    Give login
                  </Button>
                )}
                {!g.has_portal_login && !(mode === "parent" && g.is_primary) && (
                  <Button size="sm" variant="ghost" onClick={() => remove(g)}>
                    Remove
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </CardBody>
      {adding && (
        <AddModal
          base={base}
          mode={mode}
          onClose={() => setAdding(false)}
          onSaved={(list) => {
            setItems(list);
            setAdding(false);
          }}
        />
      )}
    </Card>
  );
}

function AddModal({ base, mode, onClose, onSaved }: { base: string; mode: "school" | "parent"; onClose: () => void; onSaved: (g: Guardian[]) => void }) {
  const [f, setF] = useState({
    full_name: "",
    phone: "",
    email: "",
    occupation: "",
    relation: mode === "parent" ? "grandparent" : "father",
    can_pickup: true,
    is_emergency_contact: mode === "school",
    lives_with_student: mode === "school",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body =
      mode === "parent"
        ? { full_name: f.full_name, phone: f.phone, relation: f.relation, can_pickup: true, is_emergency_contact: f.is_emergency_contact }
        : { ...f, email: f.email || null, occupation: f.occupation || null };
    try {
      const { data } = await api.post<Guardian[]>(base, body);
      onSaved(data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open onClose={onClose} title={mode === "school" ? "Add guardian" : "Add a person allowed to collect"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Full name *" value={f.full_name} onChange={set("full_name")} required />
          <Select label="Relation" value={f.relation} onChange={set("relation")}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </Select>
          <Input label="Phone *" value={f.phone} onChange={set("phone")} required />
          {mode === "school" && <Input label="Email" type="email" value={f.email} onChange={set("email")} hint="Needed if they'll get a portal login" />}
          {mode === "school" && <Input label="Occupation" value={f.occupation} onChange={set("occupation")} />}
        </div>
        {mode === "school" ? (
          <div className="flex flex-wrap gap-4 text-sm text-ink-muted">
            {(["can_pickup", "is_emergency_contact", "lives_with_student"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
                {{ can_pickup: "Can collect the child", is_emergency_contact: "Emergency contact", lives_with_student: "Lives with the child" }[k]}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-subtle">The school gate checks this list when someone comes to collect your child early.</p>
        )}
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

type Enrollment = {
  id: number;
  academic_year_name: string;
  section_label: string | null;
  roll_no: number;
  start_date: string;
  end_date: string | null;
  outcome: string;
  notes: string | null;
};

/** Year-by-year class history, with a fix-up for past outcomes. */
export function ClassHistory({ studentId }: { studentId: string | number }) {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api
      .get<Enrollment[]>(`/api/v1/school/students/${studentId}/enrollments`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);
  const tone = { studying: "brand", promoted: "emerald", repeated: "amber", left: "rose" } as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Class history</CardTitle>
      </CardHeader>
      <ErrorBox>{error}</ErrorBox>
      <Table head={["Year", "Class", "Roll", "From", "To", "Outcome"]} empty={rows.length === 0 && "No history yet."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={tdStrong}>{r.academic_year_name}</td>
            <td className={td}>
              {r.section_label}
              {r.notes && <div className="text-xs text-ink-subtle">{r.notes}</div>}
            </td>
            <td className={td}>{r.roll_no}</td>
            <td className={td}>{r.start_date}</td>
            <td className={td}>{r.end_date ?? "—"}</td>
            <td className="px-4 py-3">
              {r.end_date ? (
                <select
                  className="rounded border border-surface-border bg-surface-subtle px-2 py-1 text-xs text-ink"
                  value={r.outcome}
                  onChange={(e) =>
                    api
                      .patch(`/api/v1/school/enrollments/${r.id}`, { outcome: e.target.value })
                      .then(load)
                      .catch((err) => setError(apiError(err)))
                  }
                >
                  {["promoted", "repeated", "left"].map((o) => (
                    <option key={o} value={o}>
                      {humanize(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge tone={tone[r.outcome as keyof typeof tone] ?? "neutral"}>{humanize(r.outcome)}</Badge>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
