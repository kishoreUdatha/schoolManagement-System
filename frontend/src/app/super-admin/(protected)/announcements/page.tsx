"use client";

import { useEffect, useState } from "react";
import { Archive, CalendarClock, CheckCircle2, Megaphone, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate, toIso } from "@/lib/dates";

type Announcement = {
  id: number;
  title: string;
  body: string;
  audience: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  live: boolean;
  scheduled: boolean;
  finished: boolean;
  created_at: string;
};
type List = {
  announcements: Announcement[];
  live: number;
  scheduled: number;
  finished: number;
};

/** Things every school should read.
 *
 *  An announcement runs between two dates and stops on its own. Anything
 *  that has to be withdrawn by hand is still on screen a fortnight later.
 */
export default function AnnouncementsPage() {
  const [data, setData] = useState<List | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    audience: "all",
    starts_on: toIso(),
    ends_on: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<List>("/api/v1/super-admin/announcements")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/super-admin/announcements", {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        starts_on: form.starts_on,
        ends_on: form.ends_on || null,
      });
      setAdding(false);
      setForm({ title: "", body: "", audience: "all", starts_on: toIso(), ends_on: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (a: Announcement) => {
    setError(null);
    try {
      await api.patch(`/api/v1/super-admin/announcements/${a.id}`, {
        is_active: !a.is_active,
      });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const remove = async (a: Announcement) => {
    if (!window.confirm(`Remove "${a.title}"?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/super-admin/announcements/${a.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const rows = data?.announcements ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        subtitle="What every school sees, and for how long."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Megaphone className="mr-1.5 h-4 w-4" />
            Announce something
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The counts the list endpoint already returns, plus the length of the
          list itself — no second request behind any of them. */}
      <StatStrip
        stats={[
          { label: "Live now", value: data?.live ?? "—", icon: Megaphone },
          { label: "Scheduled", value: data?.scheduled ?? "—", icon: CalendarClock },
          { label: "Finished", value: data?.finished ?? "—", icon: CheckCircle2 },
          { label: "All time", value: rows.length, icon: Archive },
        ]}
      />

      <NoticeBox>
        An announcement starts and stops on its own dates. Leave the end date empty and
        it runs until somebody switches it off.
      </NoticeBox>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Every announcement</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {data
                ? `${data.live} live · ${data.scheduled} scheduled · ${data.finished} finished`
                : "Loading…"}
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Title", "Who sees it", "Runs", "State", ""]}
          empty={rows.length === 0 && "Nothing has been announced yet."}
        >
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={tdStrong}>
                  {a.title}
                  <span className="block max-w-md truncate text-[11px] font-normal text-ink-subtle">
                    {a.body}
                  </span>
                </td>
                <td className={td}>{humanize(a.audience)}</td>
                <td className={td}>
                  {readableDate(a.starts_on)}
                  <span className="block text-[11px] text-ink-subtle">
                    {a.ends_on ? `until ${readableDate(a.ends_on)}` : "no end date"}
                  </span>
                </td>
                <td className={td}>
                  {!a.is_active ? (
                    <Badge tone="neutral">Switched off</Badge>
                  ) : a.live ? (
                    <Badge tone="emerald">Live</Badge>
                  ) : a.scheduled ? (
                    <Badge tone="amber">Scheduled</Badge>
                  ) : (
                    <Badge tone="neutral">Finished</Badge>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => toggle(a)}>
                      {a.is_active ? "Switch off" : "Switch on"}
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Remove ${a.title}`}
                      onClick={() => remove(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
        </Table>
        <PanelFooter
          left={`${rows.length} announcement${rows.length === 1 ? "" : "s"} in all`}
          right={data ? `${data.live} running right now` : "—"}
        />
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Announce something">
        <div className="space-y-4">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            label="What it says"
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          <Select
            label="Who sees it"
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
          >
            <option value="all">Everybody</option>
            <option value="school_admins">School offices</option>
            <option value="principals">Principals</option>
            <option value="teachers">Teachers</option>
          </Select>
          <div className="flex flex-wrap gap-3">
            <Input
              label="Starts"
              type="date"
              value={form.starts_on}
              onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
            />
            <Input
              label="Ends"
              type="date"
              value={form.ends_on}
              hint="Leave empty to run until switched off."
              onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={form.title.trim().length < 3 || form.body.trim().length < 3}
            >
              Announce it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
