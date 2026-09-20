"use client";

import { useEffect, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";

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
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Catalogue = {
  channels: string[];
  categories: string[];
  locked_categories: string[];
  locked_channels: string[];
};
type Template = {
  id: number;
  code: string;
  name: string;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
  description: string | null;
  is_active: boolean;
};
type Preview = { subject: string | null; body: string; unfilled: string[] };

const CHANNEL_LABEL: Record<string, string> = {
  in_app: "In the app",
  email: "Email",
  sms: "Text message",
  whatsapp: "WhatsApp",
};

const blank = {
  code: "",
  name: "",
  channel: "in_app",
  category: "general",
  subject: "",
  body: "",
  description: "",
};

/** The wording a school reuses, and which messages a parent may refuse.
 *
 *  Placeholders use the same {braces} as the certificate templates. One
 *  convention for substitution is worth more than a better second one.
 */
export default function NotificationSettingsPage() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [rows, setRows] = useState<Template[]>([]);
  const [draft, setDraft] = useState<typeof blank>(blank);
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Template[]>("/api/v1/school/settings/notifications/templates")
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    api
      .get<Catalogue>("/api/v1/school/settings/notifications/categories")
      .then((r) => setCat(r.data))
      .catch((e) => setError(apiError(e)));
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      if (editing) {
        await api.patch(
          `/api/v1/school/settings/notifications/templates/${editing.id}`,
          draft
        );
      } else {
        await api.post("/api/v1/school/settings/notifications/templates", draft);
      }
      setOpen(false);
      setEditing(null);
      setDraft(blank);
      setSaved("Saved.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Delete the ${t.name} template?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/settings/notifications/templates/${t.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const tryIt = async (t: Template) => {
    setError(null);
    try {
      const r = await api.post<Preview>(
        `/api/v1/school/settings/notifications/templates/${t.id}/preview`,
        { values: { student_name: "Aarav Sharma", parent_name: "Mr Sharma" } }
      );
      setPreview(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  const startEdit = (t: Template) => {
    setEditing(t);
    setDraft({
      code: t.code,
      name: t.name,
      channel: t.channel,
      category: t.category,
      subject: t.subject ?? "",
      body: t.body,
      description: t.description ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Which messages families may refuse, and the wording the school reuses."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDraft(blank);
              setOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New template
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <Card>
        <CardHeader>
          <CardTitle>What families may switch off</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {cat?.categories.map((c) => {
              const locked = cat.locked_categories.includes(c);
              return (
                <Badge key={c} tone={locked ? "amber" : "neutral"}>
                  {locked && <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                  {humanize(c)}
                </Badge>
              );
            })}
          </div>
          <p className="text-[12px] text-ink-muted">
            The amber ones always reach a parent whatever they choose. Attendance,
            because it is the school saying it does not know where their child is; fees,
            because it is the school&apos;s evidence that it told them before a place was
            lost. Everything else is genuinely theirs to refuse.
          </p>
          {cat?.locked_channels.length ? (
            <p className="text-[12px] text-ink-muted">
              {cat.locked_channels.map((c) => CHANNEL_LABEL[c] ?? c).join(", ")} cannot be
              switched off on any category — that is where a message is kept, so
              silencing it would leave the message nowhere at all.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Name", "Code", "Goes by", "About", "State", ""]}
            empty={rows.length === 0 && "No templates written yet."}
          >
            {rows.map((t) => (
              <tr key={t.id}>
                <td className={tdStrong}>
                  {t.name}
                  {t.description && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {t.description}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <span className="font-mono text-[12px]">{t.code}</span>
                </td>
                <td className={td}>{CHANNEL_LABEL[t.channel] ?? humanize(t.channel)}</td>
                <td className={td}>{humanize(t.category)}</td>
                <td className={td}>
                  {t.is_active ? (
                    <Badge tone="emerald">In use</Badge>
                  ) : (
                    <Badge tone="neutral">Off</Badge>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => tryIt(t)}>
                      Preview
                    </Button>
                    <Button variant="secondary" onClick={() => startEdit(t)}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => remove(t)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "New template"}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Input
            label="Code"
            hint="How other parts of the system will ask for this one. It cannot be changed later."
            disabled={Boolean(editing)}
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <Select
            label="Goes by"
            value={draft.channel}
            onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
          >
            {cat?.channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c] ?? humanize(c)}
              </option>
            ))}
          </Select>
          <Select
            label="About"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {cat?.categories.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
                {cat.locked_categories.includes(c) ? " — cannot be refused" : ""}
              </option>
            ))}
          </Select>
          <Input
            label="Subject"
            hint="Used by email; ignored by the others."
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <Textarea
            label="Message"
            rows={5}
            hint="Put a value in braces to have it filled in, like {student_name}."
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <Input
            label="What it is for"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={!draft.name || !draft.body}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Preview">
        {preview && (
          <div className="space-y-3">
            {preview.subject && (
              <p className="text-[13px] font-bold text-ink">{preview.subject}</p>
            )}
            <p className="whitespace-pre-wrap text-[13px] text-ink-muted">
              {preview.body}
            </p>
            {preview.unfilled.length > 0 && (
              <NoticeBox>
                Nothing was supplied for {preview.unfilled.map((u) => `{${u}}`).join(", ")},
                so they are left showing rather than blanked — a message reading
                &quot;Dear ,&quot; is easy to miss in a list of two hundred.
              </NoticeBox>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
