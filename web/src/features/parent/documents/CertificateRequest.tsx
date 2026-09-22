"use client";

/*
 * PM-042 · Certificate request. The certificates this school lets parents
 * request, the request form, and the status of earlier requests (issued ones
 * open as PDF).
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath, valueClass, type Tone } from "../support/pm";
import type { Certificate, CertificateTemplate } from "./types";

const tone: Record<Certificate["status"], Tone> = { requested: "warning", issued: "good", rejected: "bad", cancelled: "" };

export function CertificateRequest() {
  return (
    <ChildGate>
      <Request />
    </ChildGate>
  );
}

function Request() {
  const { notify } = useParent();
  const base = useChildPath();
  const available = useApi<CertificateTemplate[]>(base && `${base}/certificates/available`);
  const mine = useApi<Certificate[]>(base && `${base}/certificates`);
  const [templateId, setTemplateId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const options = (available.data ?? []).filter((t) => t.parent_can_request && t.is_active);
  const chosen = options.some((t) => String(t.id) === templateId) ? templateId : options[0] ? String(options[0].id) : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!base || !chosen) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${base}/certificates`, { template_id: Number(chosen), purpose: purpose.trim() });
      notify("Request sent. The school office will review it.");
      setPurpose("");
      mine.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PmError>{err || available.error || mine.error}</PmError>
      {available.loading && !available.data ? <PmLoading /> : null}
      {available.data && options.length === 0 ? (
        <PmEmpty title="No certificates to request">The school has not made any certificates available for parents to request.</PmEmpty>
      ) : null}
      {options.length ? (
        <form onSubmit={submit}>
          <label className="field">
            Certificate type
            <select value={chosen} onChange={(e) => setTemplateId(e.target.value)}>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Purpose
            <textarea
              rows={3}
              placeholder="Describe why the certificate is required"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              minLength={3}
              maxLength={300}
            />
          </label>
          {/* Not wired: delivery preference (digital copy / collect from school) — no field in the request API. */}
          <div className="panel soft">
            <p>Requests are reviewed by the school office. Transfer certificates may require additional approvals.</p>
          </div>
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Submit certificate request"}
          </button>
        </form>
      ) : null}

      <section className="section">
        <h3>Your requests</h3>
        {mine.data && mine.data.length === 0 ? <p className="micro">No certificate requests yet.</p> : null}
        {(mine.data ?? []).map((c) => {
          const body = (
            <>
              <span>
                <strong>{c.template_name ?? label(c.kind)}</strong>
                <small>
                  {c.purpose ?? "—"} · Requested {date(c.created_at)}
                  {c.remarks ? ` · ${c.remarks}` : ""}
                </small>
              </span>
              <span className={valueClass(tone[c.status])}>{c.status === "issued" ? "View" : label(c.status)}</span>
            </>
          );
          return c.status === "issued" ? (
            <button key={c.id} className="item" onClick={() => api.open(`${base}/certificates/${c.id}/pdf`).catch((e) => setErr(errorText(e)))}>
              {body}
            </button>
          ) : (
            <div key={c.id} className="item">
              {body}
            </div>
          );
        })}
      </section>
    </>
  );
}
