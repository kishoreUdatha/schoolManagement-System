"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Table, Textarea, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { Award, ClipboardList, FileText, Layers } from "lucide-react";
import { api, apiError } from "@/lib/api";

export type Band = { grade: string; min_percent: string | number; max_percent: string | number; points?: string | number | null; remark?: string | null; is_pass?: boolean };
export type Scale = { id: number; name: string; description: string | null; is_default: boolean; is_active: boolean; used_by_exams: number; bands: Band[] };
type ExamType = { id: number; name: string; code: string; weight_percent: string | null; display_order: number; is_active: boolean; exams: number };
type Settings = {
  id: number;
  show_attendance: boolean;
  show_rank: boolean;
  show_grade_scale: boolean;
  show_remarks: boolean;
  require_result_approval: boolean;
  principal_name: string | null;
  footer_note: string | null;
};

const emptyBand = { grade: "", min_percent: "", max_percent: "", points: "", remark: "", is_pass: true };

export function GradingSetup() {
  const [scales, setScales] = useState<Scale[]>([]);
  const [types, setTypes] = useState<ExamType[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editing, setEditing] = useState<{ scale: Scale | null; name: string; description: string; bands: typeof emptyBand[] } | null>(null);
  const [typeForm, setTypeForm] = useState({ id: 0, name: "", code: "", weight_percent: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    api.get<Scale[]>("/api/v1/school/grade-scales").then((r) => setScales(r.data)).catch((e) => setError(apiError(e)));
    api.get<ExamType[]>("/api/v1/school/exam-types").then((r) => setTypes(r.data)).catch(() => setTypes([]));
    api.get<Settings>("/api/v1/school/report-card-settings").then((r) => setSettings(r.data)).catch(() => setSettings(null));
  };

  useEffect(load, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      load();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function saveScale(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body = {
      name: editing.name,
      description: editing.description.trim() || null,
      is_default: editing.scale?.is_default ?? false,
      is_active: editing.scale?.is_active ?? true,
      bands: editing.bands
        .filter((b) => b.grade.trim())
        .map((b) => ({
          grade: b.grade.trim(),
          min_percent: Number(b.min_percent),
          max_percent: Number(b.max_percent),
          points: b.points === "" ? null : Number(b.points),
          remark: (b.remark ?? "").trim() || null,
          is_pass: b.is_pass,
        })),
    };
    const ok = await run(
      () => (editing.scale ? api.put(`/api/v1/school/grade-scales/${editing.scale.id}`, body) : api.post("/api/v1/school/grade-scales", body)),
      editing.scale ? "Grade scale updated. New marks use it right away." : "Grade scale created."
    );
    if (ok) setEditing(null);
  }

  const openScale = (s: Scale | null) =>
    setEditing({
      scale: s,
      name: s?.name ?? "",
      description: s?.description ?? "",
      bands: s
        ? s.bands.map((b) => ({
            grade: b.grade,
            min_percent: String(Number(b.min_percent)),
            max_percent: String(Number(b.max_percent)),
            points: b.points === null || b.points === undefined ? "" : String(Number(b.points)),
            remark: b.remark ?? "",
            is_pass: b.is_pass ?? true,
          }))
        : [{ ...emptyBand, grade: "A", min_percent: "60", max_percent: "100" }, { ...emptyBand, grade: "B", min_percent: "0", max_percent: "59" }],
    });

  const defaultScale = scales.find((s) => s.is_default) ?? null;
  const bandCount = scales.reduce((n, s) => n + s.bands.length, 0);
  const examCount = types.reduce((n, t) => n + t.exams, 0);
  const weightTotal = types.reduce((n, t) => n + Number(t.weight_percent ?? 0), 0);

  return (
    <div className="space-y-[18px]">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {/* Only what is already loaded: the scales and exam types on screen,
          and the counts the list endpoints return with them. */}
      <StatStrip
        stats={[
          {
            label: "Grade scales",
            value: scales.length,
            note: defaultScale ? `${defaultScale.name} is the default` : "No default set",
            icon: Award,
          },
          { label: "Bands", value: bandCount || "—", note: "Across every scale", icon: Layers },
          {
            label: "Exam types",
            value: types.length || "—",
            note: weightTotal ? `${weightTotal}% of the term weighted` : "No weights set",
            icon: ClipboardList,
          },
          { label: "Exams using them", value: examCount || "—", note: "Already scheduled", icon: FileText },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Grade scales</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              The bands of marks, and the letter each one prints on a report card.
            </p>
          </div>
          <div className="flex gap-2">
            {scales.length === 0 && (
              <Button variant="secondary" onClick={() => run(() => api.post("/api/v1/school/grade-scales/seed-cbse"), "CBSE scale created.")}>
                Use CBSE 8-point
              </Button>
            )}
            <Button onClick={() => openScale(null)}>New scale</Button>
          </div>
        </CardHeader>
        <Table head={["Scale", "Bands", "Used by", "", ""]} empty={scales.length === 0 && "No scales yet — marks use the built-in A–F bands."}>
          {scales.map((s) => (
            <tr key={s.id}>
              <td className={tdStrong}>
                {s.name}
                {s.is_default && <Badge tone="emerald" className="ml-2">default</Badge>}
                {!s.is_active && <Badge tone="rose" className="ml-2">inactive</Badge>}
                {s.description && <div className="text-xs font-normal text-ink-subtle">{s.description}</div>}
              </td>
              <td className={td}>
                <div className="flex flex-wrap gap-1">
                  {s.bands.map((b) => (
                    <span key={b.grade} className="rounded border border-surface-border px-1.5 py-0.5 text-xs text-ink-muted">
                      {b.grade} {Number(b.min_percent)}–{Number(b.max_percent)}
                      {b.points !== null && b.points !== undefined && ` · ${Number(b.points)}pt`}
                    </span>
                  ))}
                </div>
              </td>
              <td className={td}>{s.used_by_exams} exam(s)</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {!s.is_default && (
                  <Button size="sm" variant="secondary" onClick={() => run(() => api.post(`/api/v1/school/grade-scales/${s.id}/default`), `${s.name} is now the default.`)}>
                    Make default
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => openScale(s)}>
                  Edit
                </Button>
                {!s.is_default && (
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${s.name}?`) && run(() => api.delete(`/api/v1/school/grade-scales/${s.id}`), "Deleted.")}>
                    Delete
                  </Button>
                )}
              </td>
              <td />
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${scales.length} scale${scales.length === 1 ? "" : "s"} · ${bandCount} band${bandCount === 1 ? "" : "s"}`}
          right={defaultScale ? `New marks use ${defaultScale.name}` : "New marks use the built-in A–F bands"}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Exam types</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              What an exam can be, and how much of the term&apos;s result each one carries.
            </p>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = { name: typeForm.name, code: typeForm.code.toUpperCase(), weight_percent: typeForm.weight_percent === "" ? null : Number(typeForm.weight_percent), display_order: 0, is_active: true };
              const ok = await run(
                () => (typeForm.id ? api.put(`/api/v1/school/exam-types/${typeForm.id}`, body) : api.post("/api/v1/school/exam-types", body)),
                typeForm.id ? "Exam type updated." : "Exam type added."
              );
              if (ok) setTypeForm({ id: 0, name: "", code: "", weight_percent: "" });
            }}
          >
            <Input label="Name *" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} required placeholder="Half yearly" />
            <Input label="Code *" value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })} required placeholder="HY" />
            <Input label="Weight % of the term" type="number" min={0} max={100} value={typeForm.weight_percent} onChange={(e) => setTypeForm({ ...typeForm, weight_percent: e.target.value })} />
            <Button type="submit">{typeForm.id ? "Save" : "Add"}</Button>
            {typeForm.id > 0 && (
              <Button type="button" variant="ghost" onClick={() => setTypeForm({ id: 0, name: "", code: "", weight_percent: "" })}>
                Cancel
              </Button>
            )}
          </form>
        </CardBody>
        <Table head={["Type", "Code", "Weight", "Exams", ""]} empty={types.length === 0 && "No exam types yet."}>
              {types.map((t) => (
                <tr key={t.id}>
                  <td className={tdStrong}>{t.name}</td>
                  <td className={td}>{t.code}</td>
                  <td className={td}>{t.weight_percent ? `${Number(t.weight_percent)}%` : "—"}</td>
                  <td className={td}>{t.exams}</td>
                  <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setTypeForm({ id: t.id, name: t.name, code: t.code, weight_percent: t.weight_percent ? String(Number(t.weight_percent)) : "" })}>
                      Edit
                    </Button>
                    {t.exams === 0 && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => api.delete(`/api/v1/school/exam-types/${t.id}`), "Deleted.")}>
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
        </Table>
        <PanelFooter
          left={`${types.length} type${types.length === 1 ? "" : "s"} · ${examCount} exam${examCount === 1 ? "" : "s"} scheduled`}
          right={weightTotal ? `${weightTotal}% of the term weighted` : "No weights set"}
        />
      </Card>

      {settings && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Report card</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">What the printed report card shows, and who signs it.</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            <div className="flex flex-wrap gap-4 text-sm text-ink">
              {([
                ["show_attendance", "Show attendance"],
                ["show_rank", "Show rank in class"],
                ["show_grade_scale", "Print the grading scale"],
                ["show_remarks", "Show remarks"],
                ["require_result_approval", "Results need approval before publishing"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Principal's name (signature line)" value={settings.principal_name ?? ""} onChange={(e) => setSettings({ ...settings, principal_name: e.target.value })} />
              <Textarea label="Footer note" rows={2} value={settings.footer_note ?? ""} onChange={(e) => setSettings({ ...settings, footer_note: e.target.value })} />
            </div>
            <Button
              onClick={() =>
                run(() => api.put("/api/v1/school/report-card-settings", { ...settings, principal_name: settings.principal_name || null, footer_note: settings.footer_note || null }), "Report card settings saved.")
              }
            >
              Save settings
            </Button>
          </CardBody>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.scale ? `Edit ${editing.scale.name}` : "New grade scale"} size="lg">
        {editing && (
          <form onSubmit={saveScale} className="space-y-3">
            <Input label="Name *" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            <Input label="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="space-y-2">
              <div className="grid grid-cols-[4rem_5rem_5rem_5rem_1fr_4rem_2rem] gap-2 text-xs text-ink-subtle">
                <span>Grade</span>
                <span>From %</span>
                <span>To %</span>
                <span>Points</span>
                <span>Meaning</span>
                <span>Pass</span>
                <span />
              </div>
              {editing.bands.map((b, i) => (
                <div key={i} className="grid grid-cols-[4rem_5rem_5rem_5rem_1fr_4rem_2rem] items-center gap-2">
                  {(["grade", "min_percent", "max_percent", "points", "remark"] as const).map((k) => (
                    <input
                      key={k}
                      className="rounded-md border border-surface-border bg-surface px-2 py-1 text-sm text-ink"
                      type={k === "grade" || k === "remark" ? "text" : "number"}
                      value={b[k] as string}
                      onChange={(e) => setEditing({ ...editing, bands: editing.bands.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                    />
                  ))}
                  <input
                    type="checkbox"
                    checked={b.is_pass}
                    onChange={(e) => setEditing({ ...editing, bands: editing.bands.map((x, j) => (j === i ? { ...x, is_pass: e.target.checked } : x)) })}
                  />
                  <button type="button" className="text-danger" onClick={() => setEditing({ ...editing, bands: editing.bands.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="text-sm text-brand-500 hover:underline" onClick={() => setEditing({ ...editing, bands: [...editing.bands, { ...emptyBand }] })}>
                + band
              </button>
              <p className="text-xs text-ink-subtle">Bands must run from 0 to 100 with no gaps or overlaps.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
