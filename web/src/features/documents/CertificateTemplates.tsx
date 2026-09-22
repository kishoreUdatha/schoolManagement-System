"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { StatusBadge } from "./parts";
import { CERT_KINDS, type CertKind, type Template } from "./types";

/**
 * SCR-260, live: GET /api/v1/school/certificates/templates and
 * /certificates/placeholders; POST /templates to create, PATCH
 * /templates/{id} to edit. ?edit=<id> opens one, ?new=1 starts a new one.
 */
export function CertificateTemplates() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");
  const creating = params.get("new") === "1";
  const list = useApi<Template[]>("/api/v1/school/certificates/templates");
  const placeholders = useApi<Record<string, string>>("/api/v1/school/certificates/placeholders");
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const shown = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter(
      (t) =>
        (!q || [t.name, t.title, t.serial_prefix].some((v) => v.toLowerCase().includes(q))) &&
        (!kind || t.kind === kind) &&
        (!status || (status === "active") === t.is_active),
    );
  }, [list.data, typed, kind, status]);

  const editing = editId ? (list.data?.find((t) => String(t.id) === editId) ?? null) : null;
  const close = () => router.replace(routeOf(260));

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search certificate templates…" aria-label="Search templates" />
        </div>
        <select aria-label="Filter type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {CERT_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {creating || editing ? (
        <TemplateEditor
          key={editing?.id ?? "new"}
          existing={editing}
          placeholders={placeholders.data ?? {}}
          onClose={close}
          onSaved={(m) => {
            notify(m);
            list.reload();
            close();
          }}
        />
      ) : null}
      <div className="resource-grid">
        {shown.map((t, i) => (
          <article className="resource-tile" key={t.id}>
            <div className={`file-icon ${i % 2 ? "xls" : "pdf"}`}>PDF</div>
            <h3>{t.name}</h3>
            <p>
              {`${label(t.kind)} · serial ${t.serial_prefix}/YYYY/nnnn`}
              <br />
              {t.parent_can_request ? "Parents can request online" : "Issued by the office only"}
            </p>
            <div className="spread">
              <StatusBadge status={t.is_active ? "active" : "inactive"} />
              <button type="button" className="btn" onClick={() => router.replace(`${routeOf(260)}?edit=${t.id}`)}>
                Preview
              </button>
            </div>
          </article>
        ))}
      </div>
      {!shown.length ? <p className="muted">{list.loading ? "Loading templates…" : "No templates match these filters."}</p> : null}
    </>
  );
}

function TemplateEditor({
  existing,
  placeholders,
  onClose,
  onSaved,
}: {
  existing: Template | null;
  placeholders: Record<string, string>;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [form, setForm] = useState({
    kind: (existing?.kind ?? "custom") as CertKind,
    name: existing?.name ?? "",
    title: existing?.title ?? "",
    body: existing?.body ?? "",
    serial_prefix: existing?.serial_prefix ?? "",
    parent_can_request: existing?.parent_can_request ?? false,
    is_active: existing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [form]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        const { kind: _kind, ...rest } = form;
        await api.patch(`/api/v1/school/certificates/templates/${existing.id}`, rest);
      } else {
        const { is_active: _active, ...rest } = form;
        await api.post("/api/v1/school/certificates/templates", rest);
      }
      onSaved(existing ? "Template saved. New certificates use the new wording." : "Template created.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="panel" onSubmit={submit} style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <div>
          <h2>{existing ? `Preview & edit · ${existing.name}` : "New template"}</h2>
          <p>Changes apply to new certificates only; issued ones keep their text.</p>
        </div>
      </div>
      <div className="panel-pad">
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <label className="field">
            <span>Type</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CertKind })} disabled={!!existing}>
              {CERT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Name
              <span className="req">*</span>
            </span>
            <input value={form.name} onChange={set("name")} required />
          </label>
          <label className="field">
            <span>
              Serial prefix
              <span className="req">*</span>
            </span>
            <input value={form.serial_prefix} onChange={set("serial_prefix")} placeholder="BON" required maxLength={12} />
          </label>
          <label className="field">
            <span>
              Heading on the certificate
              <span className="req">*</span>
            </span>
            <input value={form.title} onChange={set("title")} required />
          </label>
          <label className="field full">
            <span>
              Text (a blank line starts a new paragraph)
              <span className="req">*</span>
            </span>
            <textarea rows={9} style={{ height: 200 }} value={form.body} onChange={set("body")} required />
          </label>
        </div>
        <details className="small muted" style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }}>Placeholders you can use</summary>
          <div className="form-grid" style={{ marginTop: 8 }}>
            {Object.entries(placeholders).map(([k, v]) => (
              <button type="button" key={k} className="btn" style={{ justifyContent: "flex-start" }} onClick={() => setForm({ ...form, body: `${form.body}{${k}}` })}>
                <code>{`{${k}}`}</code>
                {` ${v}`}
              </button>
            ))}
          </div>
        </details>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="check-item" style={{ padding: 0, border: 0 }}>
            <input type="checkbox" checked={form.parent_can_request} onChange={(e) => setForm({ ...form, parent_can_request: e.target.checked })} />
            Parents can request this online
          </label>
          {existing ? (
            <label className="check-item" style={{ padding: 0, border: 0 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          ) : null}
        </div>
      </div>
      <div className="form-footer">
        <span>Fields marked * are required</span>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : existing ? "Save template" : "Create template"}
          </button>
        </div>
      </div>
    </form>
  );
}
