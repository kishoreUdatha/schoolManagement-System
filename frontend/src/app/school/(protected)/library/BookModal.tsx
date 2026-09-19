"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorBox, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { BookRow } from "./LibraryTabs";

export function BookModal({
  existing,
  categories,
  onClose,
  onSaved,
}: {
  existing?: BookRow;
  categories: string[];
  onClose: () => void;
  onSaved: (title: string) => void;
}) {
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    authors: existing?.authors ?? "",
    isbn: existing?.isbn ?? "",
    publisher: existing?.publisher ?? "",
    edition: existing?.edition ?? "",
    publish_year: existing?.publish_year?.toString() ?? "",
    category: existing?.category ?? "",
    language: existing?.language ?? "",
    shelf: existing?.shelf ?? "",
    description: existing?.description ?? "",
    digital_url: existing?.digital_url ?? "",
    is_reference: existing?.is_reference ?? false,
    copies: "1",
    price: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = (v: string) => (v.trim() ? v.trim() : null);
    const payload: Record<string, unknown> = {
      title: form.title,
      authors: n(form.authors),
      isbn: n(form.isbn),
      publisher: n(form.publisher),
      edition: n(form.edition),
      publish_year: form.publish_year ? Number(form.publish_year) : null,
      category: n(form.category),
      language: n(form.language),
      shelf: n(form.shelf),
      description: n(form.description),
      digital_url: n(form.digital_url),
      is_reference: form.is_reference,
    };
    try {
      if (existing) {
        await api.patch(`/api/v1/school/library/books/${existing.id}`, payload);
      } else {
        await api.post("/api/v1/school/library/books", { ...payload, copies: Number(form.copies || 0), price: n(form.price) });
      }
      onSaved(form.title);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit “${existing.title}”` : "Add book"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Title *" value={form.title} onChange={set("title")} required />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Author(s)" value={form.authors} onChange={set("authors")} />
          <Input label="ISBN" value={form.isbn} onChange={set("isbn")} />
          <Input label="Publisher" value={form.publisher} onChange={set("publisher")} />
          <Input label="Edition" value={form.edition} onChange={set("edition")} />
          <Input label="Year" type="number" value={form.publish_year} onChange={set("publish_year")} />
          <div className="flex flex-col gap-1">
            <Input label="Category" list="library-categories" value={form.category} onChange={set("category")} />
            <datalist id="library-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Input label="Language" value={form.language} onChange={set("language")} />
          <Input label="Shelf / rack" value={form.shelf} onChange={set("shelf")} />
          <Input label="Digital link" placeholder="https://…" value={form.digital_url} onChange={set("digital_url")} />
        </div>
        <Textarea label="Description" value={form.description} onChange={set("description")} />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={form.is_reference} onChange={(e) => setForm({ ...form, is_reference: e.target.checked })} />
          Reference only (can't be taken home)
        </label>
        {!existing && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Copies to add" type="number" min="0" value={form.copies} onChange={set("copies")} hint="Numbered automatically (A000123…)" />
            <Input label="Price per copy ₹" type="number" min="0" value={form.price} onChange={set("price")} hint="Charged if lost" />
          </div>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
