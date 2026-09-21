"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ListChecks, Phone, PhoneOff, Trash2, UserX } from "lucide-react";

import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Link = {
  id: number;
  sequence: number;
  contact_name: string;
  relationship: string;
  phone: string;
  notes: string | null;
};

type Chain = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  chain: Link[];
  profile_contact_name: string | null;
  profile_contact_phone: string | null;
  profile_contact_relation: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
};

type Thin = {
  students: {
    student_id: number;
    student_name: string;
    admission_no: string;
    section_label: string | null;
    contacts: number;
    why: string;
  }[];
  count: number;
  none_at_all: number;
};

const emptyContact = { contact_name: "", relationship: "", phone: "", notes: "" };

/** Who to ring, in order.
 *
 *  The medical profile holds one emergency contact, which is not a chain. The
 *  person who answers is whoever happens to be free, so a school standing in
 *  a corridor with an injured child needs the next number and the one after.
 */
export default function EmergencyPage() {
  const [child, setChild] = useState<PickedStudent | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [thin, setThin] = useState<Thin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...emptyContact });

  const loadThin = () =>
    api
      .get<Thin>("/api/v1/school/wellbeing/emergency/thin")
      .then((r) => setThin(r.data))
      .catch(() => setThin(null));

  useEffect(() => {
    loadThin();
  }, []);

  useEffect(() => {
    if (!child) {
      setChain(null);
      return;
    }
    api
      .get<Chain>(`/api/v1/school/wellbeing/emergency/${child.id}`)
      .then((r) => setChain(r.data))
      .catch((e) => setError(apiError(e)));
  }, [child]);

  const add = async () => {
    if (!child) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await api.post<Chain>(`/api/v1/school/wellbeing/emergency/${child.id}`, {
        ...form,
        notes: form.notes || null,
      });
      setChain(r.data);
      setForm({ ...emptyContact });
      setAdding(false);
      setSaved("Added to the chain.");
      loadThin();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (l: Link) => {
    if (!window.confirm(`Remove ${l.contact_name} from the chain?`)) return;
    setError(null);
    try {
      const r = await api.delete<Chain>(
        `/api/v1/school/wellbeing/emergency/contacts/${l.id}`
      );
      setChain(r.data);
      setSaved("Removed. The numbers below it moved up.");
      loadThin();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const move = async (index: number, delta: number) => {
    if (!chain || !child) return;
    const ids = chain.chain.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setError(null);
    try {
      const r = await api.put<Chain>(
        `/api/v1/school/wellbeing/emergency/${child.id}/order`,
        { ordered_ids: ids }
      );
      setChain(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emergency contacts"
        subtitle="Who the school rings, and in what order, when something has happened to a child."
        actions={
          <Button disabled={!child} onClick={() => setAdding(true)}>
            <Phone className="mr-1.5 h-4 w-4" />
            Add a contact
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <StatStrip
        stats={[
          {
            label: "Children with a thin chain",
            value: thin?.count ?? 0,
            note: "One person, or none",
            icon: PhoneOff,
          },
          {
            label: "Nobody at all",
            value: thin?.none_at_all ?? 0,
            note: "No contact on file",
            icon: UserX,
          },
          {
            label: "In this chain",
            value: chain?.chain.length ?? 0,
            note: chain ? chain.student_name : "No child looked up yet",
            icon: ListChecks,
          },
        ]}
      />

      {(thin?.none_at_all ?? 0) > 0 && (
        <WarnBox>
          {thin?.none_at_all} child
          {thin?.none_at_all === 1 ? " has" : "ren have"} no emergency contact on file at
          all. That is discovered at the worst possible moment unless it is fixed now.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Look up a child</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              The chain in the order it is rung, with whatever the medical profile
              holds shown above it.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <StudentPicker value={child} onChange={setChild} />

          {chain && (
            <>
              <div className="rounded-lg bg-surface-subtle p-3 text-[13px] text-ink-muted">
                <span className="font-bold text-ink">On the medical profile: </span>
                {chain.profile_contact_name
                  ? `${chain.profile_contact_name} (${chain.profile_contact_relation ?? "—"}) · ${chain.profile_contact_phone ?? "no number"}`
                  : "nothing recorded"}
                {chain.doctor_name && (
                  <span className="block">
                    Doctor: {chain.doctor_name} · {chain.doctor_phone ?? "no number"}
                  </span>
                )}
              </div>

              <Table
                head={["Order", "Who", "Relationship", "Number", "Notes", ""]}
                empty={
                  chain.chain.length === 0 &&
                  "No chain yet — only whatever is on the medical profile above."
                }
              >
                {chain.chain.map((l, i) => (
                  <tr key={l.id}>
                    <td className={tdStrong}>
                      <Badge tone={i === 0 ? "brand" : "neutral"}>{l.sequence}</Badge>
                    </td>
                    <td className={tdStrong}>{l.contact_name}</td>
                    <td className={td}>{l.relationship}</td>
                    <td className={td}>
                      <a
                        href={`tel:${l.phone}`}
                        className="font-bold text-brand-600 hover:underline"
                      >
                        {l.phone}
                      </a>
                    </td>
                    <td className={td}>{l.notes ?? "—"}</td>
                    <td className={td}>
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label="Move down"
                          disabled={i === chain.chain.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`Remove ${l.contact_name}`}
                          onClick={() => remove(l)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Children with nobody, or only one person, to ring</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              A chain of one is a chain that fails the first time that person does not
              answer.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Contacts", "Why it is thin"]}
            empty={(thin?.students.length ?? 0) === 0 && "Every child has somebody."}
          >
            {(thin?.students ?? []).map((s) => (
              <tr key={s.student_id}>
                <td className={tdStrong}>
                  <PersonCell
                    name={s.student_name}
                    sub={`${s.admission_no}${s.section_label ? ` · ${s.section_label}` : ""}`}
                  />
                </td>
                <td className={td}>{s.contacts}</td>
                <td className={td}>
                  <Badge tone={s.why === "no contact at all" ? "rose" : "amber"}>
                    {s.why}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${thin?.students.length ?? 0} child(ren) listed`}
          right={
            (thin?.none_at_all ?? 0) > 0
              ? `${thin?.none_at_all} with nobody at all`
              : "Everybody has at least one number"
          }
        />
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add to the chain">
        <div className="space-y-4">
          <p className="text-[13px] text-ink-muted">
            They go on the end. You can move them up afterwards.
          </p>
          <Input
            label="Name"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
          <Input
            label="Relationship"
            value={form.relationship}
            placeholder="Mother, uncle, neighbour…"
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Notes"
            value={form.notes}
            placeholder="Works nights, speaks Tamil…"
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={add}
              loading={busy}
              disabled={!form.contact_name.trim() || !form.phone.trim() || !form.relationship.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
