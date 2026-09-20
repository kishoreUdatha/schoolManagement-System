"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, WarnBox } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Component = {
  id: number;
  name: string;
  max_marks: number;
  pass_marks: number;
  sequence: number;
};
type Components = {
  paper_id: number;
  subject_name: string;
  class_name: string | null;
  exam_date: string;
  max_marks: number;
  pass_marks: number;
  components: Component[];
  allocated: number;
  unallocated: number;
};

type Draft = { name: string; max_marks: string; pass_marks: string };

/** How a subject is assessed, when one paper is not the whole story.
 *
 *  A paper with no parts is marked as a whole, which is how most of them
 *  work. Defining parts here does not change what the paper is out of — the
 *  parts have to add up to it — so a report card printed before and after
 *  says the same number.
 */
export default function PaperComponentsPage() {
  const { paperId } = useParams<{ paperId: string }>();
  const [data, setData] = useState<Components | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Components>(`/api/v1/school/exam-ops/papers/${paperId}/components`)
      .then((r) => {
        setData(r.data);
        setDrafts(
          r.data.components.map((c) => ({
            name: c.name,
            max_marks: String(c.max_marks),
            pass_marks: String(c.pass_marks),
          }))
        );
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  const set = (i: number, key: keyof Draft, value: string) =>
    setDrafts((d) => d.map((x, n) => (n === i ? { ...x, [key]: value } : x)));

  const allocated = drafts.reduce((n, d) => n + (Number(d.max_marks) || 0), 0);
  const paperMax = data?.max_marks ?? 0;
  const balances = drafts.length === 0 || allocated === paperMax;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const body = {
        components: drafts.map((d) => ({
          name: d.name.trim(),
          max_marks: Number(d.max_marks),
          pass_marks: Number(d.pass_marks) || 0,
        })),
      };
      const r = await api.put<Components>(
        `/api/v1/school/exam-ops/papers/${paperId}/components`,
        body
      );
      setData(r.data);
      setSaved(
        drafts.length === 0
          ? "This paper is marked as a whole again."
          : `Saved. ${r.data.components.length} parts adding up to ${r.data.allocated}.`
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const hadComponents = (data?.components.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/school/exams"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All exams
      </Link>

      <PageHeader
        title={data ? `${data.subject_name} — parts` : "Paper parts"}
        subtitle="Split a paper into theory, practical, internal or whatever this subject is actually assessed in. The parts must add up to what the paper is out of."
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Paper is out of" value={paperMax || "—"} />
        <StatCard label="Parts defined" value={drafts.length} />
        <StatCard
          label="Allocated"
          value={allocated}
          accent={balances ? "emerald" : "rose"}
          hint={balances ? undefined : `${paperMax - allocated} unaccounted for`}
        />
        <StatCard label="Pass mark" value={data?.pass_marks ?? "—"} />
      </div>

      {!balances && (
        <WarnBox>
          The parts add up to {allocated}, but the paper is out of {paperMax}. A split that
          sums to something else is not a split — it is a second opinion about what the
          paper is worth, and a report card can only print one number.
        </WarnBox>
      )}

      {hadComponents && drafts.length === 0 && (
        <WarnBox>
          Saving with no parts puts this paper back to being marked as a whole, and the
          part-by-part marks already recorded against it will be removed. The paper totals
          themselves stay.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parts</CardTitle>
          <Button
            variant="secondary"
            onClick={() =>
              setDrafts((d) => [...d, { name: "", max_marks: "", pass_marks: "0" }])
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add a part
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {drafts.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              No parts yet — this paper is marked as a whole.
            </p>
          )}
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="min-w-[180px] flex-1 text-[12px] font-bold text-ink-muted">
                <span className="mb-1 block">Name</span>
                <Input
                  value={d.name}
                  placeholder="Theory"
                  onChange={(e) => set(i, "name", e.target.value)}
                />
              </label>
              <label className="w-28 text-[12px] font-bold text-ink-muted">
                <span className="mb-1 block">Out of</span>
                <Input
                  type="number"
                  min={1}
                  value={d.max_marks}
                  onChange={(e) => set(i, "max_marks", e.target.value)}
                />
              </label>
              <label className="w-28 text-[12px] font-bold text-ink-muted">
                <span className="mb-1 block">Pass mark</span>
                <Input
                  type="number"
                  min={0}
                  value={d.pass_marks}
                  onChange={(e) => set(i, "pass_marks", e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                aria-label={`Remove ${d.name || "part"}`}
                onClick={() => setDrafts((x) => x.filter((_, n) => n !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="text-[12px] text-ink-subtle">
            A pass mark of 0 means the part has no pass requirement of its own — only the
            paper total has to clear. That is the usual arrangement for an internal.
          </p>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} loading={busy} disabled={!balances}>
          Save parts
        </Button>
        {hadComponents && (
          <Link href={`/school/exams/papers/${paperId}/component-marks`}>
            <Button variant="secondary">Enter part marks</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
