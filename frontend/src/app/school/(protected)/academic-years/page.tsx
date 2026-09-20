"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type AcademicYear = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
  created_at: string;
};

export default function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const { data } = await api.get<AcademicYear[]>(
        "/api/v1/school/academic-years",
        { params: { include_archived: includeArchived } }
      );
      setYears(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  async function action(
    yearId: number,
    path: string,
    method: "post" | "delete" = "post",
    successMsg?: string
  ) {
    setBusyId(yearId);
    setError(null);
    setNotice(null);
    try {
      if (method === "delete") {
        await api.delete(`/api/v1/school/academic-years/${yearId}`);
      } else {
        await api.post(`/api/v1/school/academic-years/${yearId}${path}`);
      }
      if (successMsg) setNotice(successMsg);
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Academic years</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            All attendance, marks, and fees are scoped to an academic year. Mark
            exactly one as <strong>current</strong>.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ New academic year</Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
          className="rounded border-slate-300"
        />
        Show archived years
      </label>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Dates</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {years.map((y) => {
              const busy = busyId === y.id;
              return (
                <tr key={y.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {y.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {y.start_date} → {y.end_date}
                  </td>
                  <td className="px-4 py-3 space-x-1">
                    {y.is_current && <Badge tone="emerald">current</Badge>}
                    {y.is_archived && <Badge tone="neutral">archived</Badge>}
                    {!y.is_current && !y.is_archived && (
                      <Badge tone="brand">active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {!y.is_current && !y.is_archived && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy}
                        onClick={() =>
                          action(y.id, "/set-current", "post", `${y.name} is now the current year.`)
                        }
                      >
                        Set current
                      </Button>
                    )}
                    {!y.is_archived ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy}
                        onClick={() =>
                          action(y.id, "/archive", "post", `${y.name} archived.`)
                        }
                      >
                        Archive
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy}
                        onClick={() =>
                          action(y.id, "/unarchive", "post", `${y.name} restored.`)
                        }
                      >
                        Unarchive
                      </Button>
                    )}
                    {!y.is_current && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${y.name}? This cannot be undone.`
                            )
                          ) {
                            action(y.id, "", "delete", `${y.name} deleted.`);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {years.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No academic years yet — click <strong>New academic year</strong>{" "}
                  to add the first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <CreateYearModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={(name) => {
          setOpenCreate(false);
          setNotice(`Created ${name}.`);
          load();
        }}
      />
    </div>
  );
}

function CreateYearModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setStartDate("");
    setEndDate("");
    setIsCurrent(false);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/school/academic-years", {
        name,
        start_date: startDate,
        end_date: endDate,
        is_current: isCurrent,
      });
      onCreated(name);
      reset();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New academic year"
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name *"
          placeholder="e.g. 2026-27"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Start date *"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <Input
            label="End date *"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isCurrent}
            onChange={(e) => setIsCurrent(e.target.checked)}
            className="rounded border-slate-300"
          />
          Mark as current academic year
        </label>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
