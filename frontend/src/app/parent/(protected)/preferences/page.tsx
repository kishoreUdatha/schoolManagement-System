"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, humanize } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type Row = {
  channel: string;
  category: string;
  is_enabled: boolean;
  locked: boolean;
  locked_because: string | null;
};
type Preferences = {
  user_id: number;
  rows: Row[];
  locked_categories: string[];
  locked_channels: string[];
};

const CHANNEL_LABEL: Record<string, string> = {
  in_app: "In the app",
  email: "Email",
  sms: "Text message",
  whatsapp: "WhatsApp",
};

/** What the school may send you, and how.
 *
 *  Everything is on until you say otherwise — there is no row in the database
 *  for a choice you have not made, so a school switching on text messages
 *  reaches you rather than reaching nobody.
 */
export default function ParentPreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Preferences>("/api/v1/parent/me/preferences")
      .then((r) => setPrefs(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const toggle = async (row: Row) => {
    const key = `${row.channel}-${row.category}`;
    setBusy(key);
    setError(null);
    setSaved(null);
    try {
      const r = await api.put<Preferences>("/api/v1/parent/me/preferences", {
        channel: row.channel,
        category: row.category,
        is_enabled: !row.is_enabled,
      });
      setPrefs(r.data);
      setSaved(
        row.is_enabled
          ? `You will no longer get ${row.category} messages by ${CHANNEL_LABEL[row.channel]?.toLowerCase() ?? row.channel}.`
          : `${humanize(row.category)} messages are back on.`
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const channels = [...new Set((prefs?.rows ?? []).map((r) => r.channel))];
  const categories = [...new Set((prefs?.rows ?? []).map((r) => r.category))];
  const find = (channel: string, category: string) =>
    prefs?.rows.find((r) => r.channel === channel && r.category === category);

  return (
    <div className="space-y-6">
      <PageHeader
        title="What we send you"
        subtitle="Everything is on unless you turn it off. A few things cannot be turned off — those are marked."
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {prefs && prefs.locked_categories.length > 0 && (
        <p className="text-[13px] text-ink-muted">
          <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {prefs.locked_categories.map(humanize).join(" and ")} messages always come
          through. The school has to be able to reach you about where your child is and
          about money owed — a preference should not become the reason nobody told you.
        </p>
      )}

      {channels.map((channel) => (
        <Card key={channel}>
          <CardHeader>
            <CardTitle>{CHANNEL_LABEL[channel] ?? humanize(channel)}</CardTitle>
            {prefs?.locked_channels.includes(channel) && (
              <Badge tone="neutral">Always on</Badge>
            )}
          </CardHeader>
          <CardBody className="space-y-2">
            {prefs?.locked_channels.includes(channel) && (
              <p className="text-[12px] text-ink-subtle">
                This is where your messages are kept, so it stays on. Turning it off
                would leave you with nowhere to read them.
              </p>
            )}
            {categories.map((category) => {
              const row = find(channel, category);
              if (!row) return null;
              const key = `${channel}-${category}`;
              return (
                <label
                  key={key}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                    row.locked ? "opacity-70" : "hover:bg-surface-hover"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-ink">
                      {humanize(category)}
                    </span>
                    {row.locked_because && (
                      <span className="block text-[11px] text-ink-subtle">
                        {row.locked_because}
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={row.is_enabled}
                    disabled={row.locked || busy === key}
                    onChange={() => toggle(row)}
                    aria-label={`${humanize(category)} by ${CHANNEL_LABEL[channel] ?? channel}`}
                  />
                </label>
              );
            })}
          </CardBody>
        </Card>
      ))}

      {!prefs && !error && (
        <p className="text-[13px] text-ink-subtle">Loading your preferences…</p>
      )}
    </div>
  );
}
