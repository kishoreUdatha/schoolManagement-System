"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type FeeHead = {
  id: number;
  name: string;
  code: string | null;
  frequency: string;
  category: string | null;
};

export default function AccountantFeesPage() {
  const [heads, setHeads] = useState<FeeHead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FeeHead[]>("/api/v1/school/fees/heads")
      .then((r) => setHeads(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Fees</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Read-only fee heads. Full collection workflow is on the way.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Fee heads {heads && <Badge tone="brand">{heads.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardBody>
          {heads === null && (
            <p className="text-sm text-ink-muted">Loading…</p>
          )}
          {heads && heads.length === 0 && (
            <p className="text-sm text-ink-muted">
              No fee heads defined yet. Ask the school admin to set them up
              under <code>/school/fees/heads</code>.
            </p>
          )}
          {heads && heads.length > 0 && (
            <table className="min-w-full divide-y divide-surface-border text-sm">
              <thead className="text-left text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Frequency</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {heads.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2 font-medium text-ink">{h.name}</td>
                    <td className="px-3 py-2 font-mono text-ink-muted">
                      {h.code || "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{h.frequency}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {h.category || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-ink-subtle">
        Recording payments and viewing student fee status will land in the next
        accountant story.
      </p>
    </div>
  );
}
