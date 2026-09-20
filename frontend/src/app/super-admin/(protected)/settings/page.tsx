"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Setting = {
  key: string;
  value: Record<string, unknown> | null;
  description: string | null;
  set: boolean;
  updated_at: string | null;
};

/** A stored value is always an object, so the column has one shape whatever
 *  the setting is. A plain value lives under "value" — unwrap it for editing
 *  so nobody has to type JSON to change a support address. */
function display(v: Setting["value"]): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "value" in v && Object.keys(v).length === 1) {
    const inner = (v as { value: unknown }).value;
    return typeof inner === "string" ? inner : JSON.stringify(inner);
  }
  return JSON.stringify(v);
}

export default function PlatformSettingsPage() {
  const [rows, setRows] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api
      .get<Setting[]>("/api/v1/super-admin/settings")
      .then((r) => {
        setRows(r.data);
        setDrafts(Object.fromEntries(r.data.map((s) => [s.key, display(s.value)])));
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const save = async (s: Setting) => {
    setBusy(s.key);
    setError(null);
    setSaved(null);
    try {
      const raw = (drafts[s.key] ?? "").trim();
      // Something that parses as JSON is stored as it parsed; anything else is
      // a plain string. Typing true should not store the word "true".
      let value: unknown = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      await api.put("/api/v1/super-admin/settings", { key: s.key, value });
      setSaved(`${s.key} saved.`);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const unset = async (s: Setting) => {
    if (!window.confirm(`Put ${s.key} back to its default?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/super-admin/settings/${s.key}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const setCount = rows.filter((r) => r.set).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform settings"
        subtitle="The knobs that apply to every school at once."
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Settings" value={rows.length} />
        <StatCard label="Set" value={setCount} accent="emerald" />
        <StatCard
          label="On their default"
          value={rows.length - setCount}
          hint="Nothing stored yet"
        />
      </div>

      <NoticeBox>
        A setting that has never been touched shows here anyway, so nobody has to guess
        a spelling. Anything that looks like JSON is stored as JSON; anything else is
        stored as plain text.
      </NoticeBox>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Setting", "Value", "State", ""]}
            empty={rows.length === 0 && "Nothing to configure yet."}
          >
            {rows.map((s) => (
              <tr key={s.key}>
                <td className={tdStrong}>
                  <span className="font-mono text-[12px]">{s.key}</span>
                  {s.description && (
                    <span className="block max-w-sm text-[11px] font-normal text-ink-subtle">
                      {s.description}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Input
                    aria-label={s.key}
                    value={drafts[s.key] ?? ""}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [s.key]: e.target.value })
                    }
                  />
                </td>
                <td className={td}>
                  {s.set ? (
                    <>
                      <Badge tone="emerald">Set</Badge>
                      {s.updated_at && (
                        <span className="block text-[11px] text-ink-subtle">
                          {dateTime(s.updated_at)}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge tone="neutral">Default</Badge>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      loading={busy === s.key}
                      onClick={() => save(s)}
                    >
                      Save
                    </Button>
                    {s.set && (
                      <Button
                        variant="secondary"
                        aria-label={`Unset ${s.key}`}
                        onClick={() => unset(s)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
