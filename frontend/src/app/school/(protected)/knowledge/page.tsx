"use client";

import { BookOpenText, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAiEnabled } from "@/lib/ai";
import { api, apiError } from "@/lib/api";

type Doc = {
  id: number;
  title: string;
  audience: "all" | "staff";
  chars: number;
  preview: string;
  updated_at: string;
};

const inputCls = "w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink";

/** Documents the "Ask the school" assistant answers from (RAG). */
export default function KnowledgeBasePage() {
  const aiEnabled = useAiEnabled();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState<"all" | "staff">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Doc[]>("/api/v1/ai/school/knowledge")
      .then((r) => setDocs(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/ai/school/knowledge", { title, content, audience });
      setTitle("");
      setContent("");
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Doc) {
    if (!confirm(`Delete "${d.title}"?`)) return;
    try {
      await api.delete(`/api/v1/ai/school/knowledge/${d.id}`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setContent(await f.text());
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    e.target.value = "";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <BookOpenText className="h-6 w-6 text-brand-500" /> School knowledge base
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Policies, FAQs, fee rules, timings, uniform and transport details. The &ldquo;Ask the school&rdquo;
          assistant answers parents and staff from these documents, sent notices and the holiday calendar,
          so the office gets fewer repeat questions.
        </p>
        {!aiEnabled && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            AI is not configured on this server, so the assistant is hidden. You can still prepare documents.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a document</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={add} className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title, e.g. Fee policy 2026-27"
                maxLength={200}
                required
                className={`${inputCls} flex-1`}
              />
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as "all" | "staff")}
                className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink"
              >
                <option value="all">Parents and staff</option>
                <option value="staff">Staff only</option>
              </select>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Paste the text of the policy or FAQ…"
              required
              minLength={10}
              className={inputCls}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
              <label>
                or load a .txt / .md file: <input type="file" accept=".txt,.md,text/plain" onChange={onFile} />
              </label>
              <Button type="submit" loading={busy}>
                Add document
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Documents ({docs.length})</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-surface-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {d.title}
                  <span className="ml-2 rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] uppercase text-ink-muted">
                    {d.audience === "all" ? "parents + staff" : "staff only"}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-subtle">{d.preview}</p>
              </div>
              <button onClick={() => remove(d)} aria-label="Delete" className="text-ink-subtle hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {docs.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-ink-muted">No documents yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
