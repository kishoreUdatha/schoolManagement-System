"use client";

import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Pill, Stethoscope, Undo2 } from "lucide-react";

import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
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
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { hhmm, readableDate, toIso } from "@/lib/dates";

/** A control sized for the filter bar: one row of equal-height controls,
 *  with the label carried by aria-label rather than stacked above. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Dose = {
  id: number;
  student_id: number;
  student_name?: string | null;
  admission_no?: string | null;
  section_label?: string | null;
  given_on: string;
  given_at: string;
  medicine: string;
  dose: string;
  reason: string | null;
  given_by: string | null;
  parent_informed: boolean;
  notes: string | null;
  corrects_id: number | null;
  correction_reason: string | null;
  is_superseded: boolean;
};

type Aid = {
  id: number;
  student_id: number | null;
  student_name: string | null;
  admission_no: string | null;
  section_label: string | null;
  staff_name: string | null;
  happened_on: string;
  happened_at: string;
  place: string | null;
  what_happened: string;
  treatment: string;
  treated_by: string | null;
  outcome: string;
  sent_home: boolean;
  parent_informed: boolean;
  referred_to: string | null;
};

const OUTCOMES = ["returned_to_class", "rested_in_clinic", "sent_home", "referred_out"];

const emptyDose = {
  given_on: toIso(),
  given_at: "09:00",
  medicine: "",
  dose: "",
  reason: "",
  parent_informed: false,
  notes: "",
};

const emptyAid = {
  happened_on: toIso(),
  happened_at: "09:00",
  place: "",
  what_happened: "",
  treatment: "",
  outcome: "returned_to_class",
  sent_home: false,
  parent_informed: false,
  referred_to: "",
};

/** The dose register and the first-aid log.
 *
 *  Both are produced when somebody asks what happened to a child, so neither
 *  can be quietly tidied up: a dose is corrected by writing a second record
 *  that points at the first, and the screen shows both.
 */
export default function MedicationPage() {
  const [tab, setTab] = useState<"medication" | "first-aid">("medication");
  const [from, setFrom] = useState(toIso(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(toIso());

  const [doses, setDoses] = useState<Dose[]>([]);
  const [aid, setAid] = useState<Aid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [giving, setGiving] = useState(false);
  const [doseForm, setDoseForm] = useState({ ...emptyDose });
  const [child, setChild] = useState<PickedStudent | null>(null);

  const [correcting, setCorrecting] = useState<Dose | null>(null);
  const [fix, setFix] = useState({ ...emptyDose, correction_reason: "" });

  const [logging, setLogging] = useState(false);
  const [aidForm, setAidForm] = useState({ ...emptyAid });
  const [hurtChild, setHurtChild] = useState<PickedStudent | null>(null);

  const load = useCallback(() => {
    const params = { from, to };
    api
      .get<Dose[]>("/api/v1/school/wellbeing/medication", { params })
      .then((r) => setDoses(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Aid[]>("/api/v1/school/wellbeing/first-aid", { params })
      .then((r) => setAid(r.data))
      .catch(() => setAid([]));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const giveDose = async () => {
    if (!child) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post("/api/v1/school/wellbeing/medication", {
        student_id: child.id,
        ...doseForm,
        given_at: `${doseForm.given_at}:00`,
        reason: doseForm.reason || null,
        notes: doseForm.notes || null,
      });
      setSaved(`Recorded for ${child.full_name}.`);
      setGiving(false);
      setChild(null);
      setDoseForm({ ...emptyDose });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const correct = async () => {
    if (!correcting) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/wellbeing/medication/${correcting.id}/correct`, {
        given_on: fix.given_on,
        given_at: `${fix.given_at}:00`,
        medicine: fix.medicine,
        dose: fix.dose,
        correction_reason: fix.correction_reason,
        reason: fix.reason || null,
        notes: fix.notes || null,
      });
      setSaved("Corrected. The original record stays on the register.");
      setCorrecting(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const logAid = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post("/api/v1/school/wellbeing/first-aid", {
        student_id: hurtChild ? hurtChild.id : null,
        ...aidForm,
        happened_at: `${aidForm.happened_at}:00`,
        place: aidForm.place || null,
        referred_to: aidForm.referred_to || null,
      });
      setSaved("Logged.");
      setLogging(false);
      setHurtChild(null);
      setAidForm({ ...emptyAid });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const openCorrection = (d: Dose) => {
    setFix({
      given_on: d.given_on,
      given_at: hhmm(d.given_at),
      medicine: d.medicine,
      dose: d.dose,
      reason: d.reason ?? "",
      parent_informed: d.parent_informed,
      notes: d.notes ?? "",
      correction_reason: "",
    });
    setCorrecting(d);
  };

  const live = doses.filter((d) => !d.is_superseded);
  const sentHome = aid.filter((a) => a.sent_home).length;
  const unreported = aid.filter((a) => a.student_id && !a.parent_informed).length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Medication and first aid"
        subtitle="Every dose given and every injury treated. Both are records the school has to be able to produce, so neither can be edited away."
        actions={
          <>
            <Button onClick={() => setGiving(true)}>
              <Pill className="mr-1.5 h-4 w-4" />
              Record a dose
            </Button>
            <Button variant="secondary" onClick={() => setLogging(true)}>
              <Stethoscope className="mr-1.5 h-4 w-4" />
              Log first aid
            </Button>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {/* Counted off the two registers already loaded for this window, not a
          second query: what was given, what was corrected, what was treated. */}
      <StatStrip
        stats={[
          {
            label: "Doses given",
            value: live.length,
            note: `${readableDate(from)} to ${readableDate(to)}`,
            icon: Pill,
          },
          {
            label: "Corrected",
            value: doses.length - live.length,
            note:
              doses.length > live.length
                ? "Originals still on the register"
                : "Nothing corrected",
            icon: Undo2,
          },
          { label: "First aid", value: aid.length, note: "Entries in this window", icon: Stethoscope },
          {
            label: "Sent home",
            value: sentHome,
            note: sentHome ? "After being treated" : "Nobody sent home",
            icon: DoorOpen,
          },
        ]}
      />

      <FilterBar>
        <input
          type="date"
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={filterSelect}
        />
        <input
          type="date"
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={filterSelect}
        />
      </FilterBar>

      {unreported > 0 && (
        <WarnBox>
          {unreported} first-aid entr{unreported === 1 ? "y" : "ies"} for a child with no
          parent told yet. A bump nobody mentioned is the one a family hears about from
          the child instead.
        </WarnBox>
      )}

      <nav className="flex gap-1 border-b border-surface-border">
        {(["medication", "first-aid"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "border-b-2 border-brand-600 px-3 py-2 text-[13px] font-extrabold text-brand-600"
                : "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-ink-muted hover:text-ink"
            }
          >
            {t === "medication" ? "Dose register" : "First aid"}
          </button>
        ))}
      </nav>

      {tab === "medication" ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Dose register</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                Every dose recorded between {readableDate(from)} and {readableDate(to)},
                corrections included.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["When", "Child", "Medicine", "Dose", "Given by", "Parent told", ""]}
              empty={doses.length === 0 && "No doses recorded in this window."}
            >
              {doses.map((d) => (
                <tr key={d.id} className={d.is_superseded ? "opacity-60" : undefined}>
                  <td className={td}>
                    {readableDate(d.given_on)}
                    <span className="block text-[11px] text-ink-subtle">
                      {hhmm(d.given_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PersonCell
                      name={d.student_name ?? "—"}
                      sub={`${d.admission_no ?? ""}${d.section_label ? ` · ${d.section_label}` : ""}`}
                    />
                  </td>
                  <td className={td}>
                    {d.medicine}
                    {d.reason && (
                      <span className="block text-[11px] text-ink-subtle">{d.reason}</span>
                    )}
                  </td>
                  <td className={tdStrong}>{d.dose}</td>
                  <td className={td}>{d.given_by ?? "—"}</td>
                  <td className={td}>
                    {d.parent_informed ? (
                      <Badge tone="emerald">Told</Badge>
                    ) : (
                      <Badge tone="amber">Not yet</Badge>
                    )}
                  </td>
                  <td className={td}>
                    {d.is_superseded ? (
                      <Badge tone="neutral">Superseded</Badge>
                    ) : d.corrects_id ? (
                      <span className="text-[11px] text-ink-subtle">
                        Corrects #{d.corrects_id}
                        {d.correction_reason ? ` — ${d.correction_reason}` : ""}
                      </span>
                    ) : (
                      <Button variant="secondary" onClick={() => openCorrection(d)}>
                        Correct
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
          <PanelFooter
            left={`${doses.length} record${doses.length === 1 ? "" : "s"} · ${live.length} standing`}
            right={
              doses.length > live.length
                ? `${doses.length - live.length} superseded by a correction`
                : "Nothing has been corrected"
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>First aid</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                Children and staff treated between {readableDate(from)} and{" "}
                {readableDate(to)}.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["When", "Who", "What happened", "Treatment", "Outcome", "Parent told"]}
              empty={aid.length === 0 && "Nothing logged in this window."}
            >
              {aid.map((a) => (
                <tr key={a.id}>
                  <td className={td}>
                    {readableDate(a.happened_on)}
                    <span className="block text-[11px] text-ink-subtle">
                      {hhmm(a.happened_at)}
                      {a.place ? ` · ${a.place}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PersonCell
                      name={a.student_name ?? a.staff_name ?? "—"}
                      sub={a.student_name ? a.section_label ?? a.admission_no : "Staff"}
                    />
                  </td>
                  <td className={td}>{a.what_happened}</td>
                  <td className={td}>
                    {a.treatment}
                    {a.referred_to && (
                      <span className="block text-[11px] text-ink-subtle">
                        Referred to {a.referred_to}
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    <Badge tone={a.sent_home ? "amber" : "neutral"}>
                      {humanize(a.outcome)}
                    </Badge>
                  </td>
                  <td className={td}>
                    {!a.student_id ? (
                      <span className="text-ink-subtle">—</span>
                    ) : a.parent_informed ? (
                      <Badge tone="emerald">Told</Badge>
                    ) : (
                      <Badge tone="amber">Not yet</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
          <PanelFooter
            left={`${aid.length} entr${aid.length === 1 ? "y" : "ies"} in this window`}
            right={sentHome ? `${sentHome} sent home` : "Nobody sent home"}
          />
        </Card>
      )}

      <Modal open={giving} onClose={() => setGiving(false)} title="Record a dose">
        <div className="space-y-4">
          <WarnBox>
            This goes on the register as given. It cannot be edited or deleted afterwards —
            a mistake is corrected by writing a second record, and both stay visible.
          </WarnBox>
          <StudentPicker value={child} onChange={setChild} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              value={doseForm.given_on}
              onChange={(e) => setDoseForm({ ...doseForm, given_on: e.target.value })}
            />
            <Input
              label="Time"
              type="time"
              value={doseForm.given_at}
              onChange={(e) => setDoseForm({ ...doseForm, given_at: e.target.value })}
            />
            <Input
              label="Medicine"
              value={doseForm.medicine}
              onChange={(e) => setDoseForm({ ...doseForm, medicine: e.target.value })}
            />
            <Input
              label="Amount given"
              value={doseForm.dose}
              placeholder="250mg"
              onChange={(e) => setDoseForm({ ...doseForm, dose: e.target.value })}
            />
          </div>
          <Input
            label="Why"
            value={doseForm.reason}
            onChange={(e) => setDoseForm({ ...doseForm, reason: e.target.value })}
          />
          <Textarea
            label="Notes"
            rows={2}
            value={doseForm.notes}
            onChange={(e) => setDoseForm({ ...doseForm, notes: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={doseForm.parent_informed}
              onChange={(e) =>
                setDoseForm({ ...doseForm, parent_informed: e.target.checked })
              }
            />
            The parent has been told
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGiving(false)}>
              Cancel
            </Button>
            <Button
              onClick={giveDose}
              loading={busy}
              disabled={!child || !doseForm.medicine || !doseForm.dose}
            >
              Record it
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={correcting !== null}
        onClose={() => setCorrecting(null)}
        title="Correct a dose record"
      >
        <div className="space-y-4">
          <NoticeBox>
            The original stays on the register, marked superseded. This writes what the
            school now says is true, alongside it.
          </NoticeBox>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              value={fix.given_on}
              onChange={(e) => setFix({ ...fix, given_on: e.target.value })}
            />
            <Input
              label="Time"
              type="time"
              value={fix.given_at}
              onChange={(e) => setFix({ ...fix, given_at: e.target.value })}
            />
            <Input
              label="Medicine"
              value={fix.medicine}
              onChange={(e) => setFix({ ...fix, medicine: e.target.value })}
            />
            <Input
              label="Amount given"
              value={fix.dose}
              onChange={(e) => setFix({ ...fix, dose: e.target.value })}
            />
          </div>
          <Input
            label="What was wrong with the original"
            value={fix.correction_reason}
            onChange={(e) => setFix({ ...fix, correction_reason: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCorrecting(null)}>
              Cancel
            </Button>
            <Button
              onClick={correct}
              loading={busy}
              disabled={fix.correction_reason.trim().length < 3}
            >
              Write the correction
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={logging} onClose={() => setLogging(false)} title="Log first aid">
        <div className="space-y-4">
          <p className="text-[13px] text-ink-muted">
            For a child, pick them below. For a member of staff, leave it empty and say
            what happened — adults are hurt at work too.
          </p>
          <StudentPicker label="Child (leave empty for staff)" value={hurtChild} onChange={setHurtChild} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              value={aidForm.happened_on}
              onChange={(e) => setAidForm({ ...aidForm, happened_on: e.target.value })}
            />
            <Input
              label="Time"
              type="time"
              value={aidForm.happened_at}
              onChange={(e) => setAidForm({ ...aidForm, happened_at: e.target.value })}
            />
          </div>
          <Input
            label="Where"
            value={aidForm.place}
            onChange={(e) => setAidForm({ ...aidForm, place: e.target.value })}
          />
          <Textarea
            label="What happened"
            rows={2}
            value={aidForm.what_happened}
            onChange={(e) => setAidForm({ ...aidForm, what_happened: e.target.value })}
          />
          <Textarea
            label="Treatment given"
            rows={2}
            value={aidForm.treatment}
            onChange={(e) => setAidForm({ ...aidForm, treatment: e.target.value })}
          />
          <Select
            label="Outcome"
            value={aidForm.outcome}
            onChange={(e) => setAidForm({ ...aidForm, outcome: e.target.value })}
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {humanize(o)}
              </option>
            ))}
          </Select>
          <Input
            label="Referred to"
            value={aidForm.referred_to}
            placeholder="Hospital, GP…"
            onChange={(e) => setAidForm({ ...aidForm, referred_to: e.target.value })}
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={aidForm.sent_home}
                onChange={(e) => setAidForm({ ...aidForm, sent_home: e.target.checked })}
              />
              Sent home
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={aidForm.parent_informed}
                onChange={(e) =>
                  setAidForm({ ...aidForm, parent_informed: e.target.checked })
                }
              />
              Parent told
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogging(false)}>
              Cancel
            </Button>
            <Button
              onClick={logAid}
              loading={busy}
              disabled={!aidForm.what_happened || !aidForm.treatment}
            >
              Log it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
