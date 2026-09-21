"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "./common";
import type { FeeHead, LateFeePreview, LateFeeRule } from "./types";

const BASIS: [LateFeeRule["basis"], string, string][] = [
  ["per_day", "Fixed daily amount", "Daily amount (₹)"],
  ["once", "One-time amount", "Amount (₹)"],
  ["percent_per_month", "Percent of the due, per month late", "Percent per month"],
];

type Form = { id: number; name: string; fee_head_id: string; charge_head_id: string; basis: LateFeeRule["basis"]; amount: string; grace_days: string; max_amount: string; is_active: boolean };
const EMPTY: Form = { id: 0, name: "", fee_head_id: "", charge_head_id: "", basis: "per_day", amount: "", grace_days: "0", max_amount: "", is_active: true };

export const describeRule = (r: LateFeeRule) =>
  `${r.basis === "percent_per_month" ? `${Number(r.amount)}% a month` : `${money(r.amount)}${r.basis === "per_day" ? " a day" : " once"}`} after ${r.grace_days} day${r.grace_days === 1 ? "" : "s"}${r.max_amount ? `, at most ${money(r.max_amount)}` : ""}`;

/**
 * SCR-164, live: GET/POST /school/fees/late-fee-rules, PUT/DELETE /{id}.
 * The aside previews what the rules would charge today
 * (GET /school/fees/late-fees/preview) and charges it (POST /late-fees/apply).
 */
export function FineRules() {
  const rules = useApi<LateFeeRule[]>("/api/v1/school/fees/late-fee-rules");
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads", { active_only: true });
  const preview = useApi<LateFeePreview>("/api/v1/school/fees/late-fees/preview");
  const [f, setF] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const basis = BASIS.find(([b]) => b === f.basis)!;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: f.name.trim(),
      fee_head_id: f.fee_head_id ? Number(f.fee_head_id) : null,
      charge_head_id: Number(f.charge_head_id),
      basis: f.basis,
      amount: f.amount,
      grace_days: Number(f.grace_days) || 0,
      max_amount: f.max_amount || null,
      is_active: f.is_active,
    };
    try {
      if (f.id) await api.put(`/api/v1/school/fees/late-fee-rules/${f.id}`, body);
      else await api.post("/api/v1/school/fees/late-fee-rules", body);
      notify(f.id ? "Rule updated." : "Rule added.");
      setF(EMPTY);
      rules.reload();
      preview.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: LateFeeRule) {
    if (!window.confirm(`Delete the rule "${r.name}"? Late fees already charged stay on the students' accounts.`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/fees/late-fee-rules/${r.id}`);
      notify("Rule deleted.");
      if (f.id === r.id) setF(EMPTY);
      rules.reload();
      preview.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function apply() {
    if (!window.confirm(`Charge ${money(preview.data?.total ?? 0)} in late fees now and tell the parents?`)) return;
    setApplying(true);
    setError(null);
    try {
      const r = await api.post<{ created: number; updated: number; total: string }>("/api/v1/school/fees/late-fees/apply", { notify_parents: true });
      notify(`Late fees charged: ${r.created} new, ${r.updated} updated, ${money(r.total)} in all.`);
      preview.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setApplying(false);
    }
  }

  const p = preview.data;

  return (
    <div className="two-col">
      <form id="fine-rule-form" className="panel" onSubmit={save}>
        <div className="panel-pad">
          <ErrorNote>{error ?? rules.error ?? heads.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>{f.id ? `Details · editing ${f.name}` : "Details"}</h3>
              </div>
              <div className="form-grid">
                <Field label="Rule name" required>
                  <input value={f.name} onChange={set("name")} minLength={2} maxLength={120} required placeholder="Monthly tuition late fee" />
                </Field>
                <Field label="Fee head">
                  <select value={f.fee_head_id} onChange={set("fee_head_id")}>
                    <option value="">Every fee head</option>
                    {heads.data?.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Book the fine under" required>
                  <select value={f.charge_head_id} onChange={set("charge_head_id")} required>
                    <option value="">Select fee head</option>
                    {heads.data?.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Grace period (days)" required>
                  <input type="number" min={0} max={365} value={f.grace_days} onChange={set("grace_days")} required />
                </Field>
                <Field label="Fine method" required>
                  <select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value as Form["basis"] })} required>
                    {BASIS.map(([b, t]) => (
                      <option key={b} value={b}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={basis[2]} required>
                  <input type="number" min={0.01} max={1000000} step="0.01" value={f.amount} onChange={set("amount")} required />
                </Field>
                <Field label="Maximum fine (₹)">
                  <input type="number" min={0.01} max={1000000} step="0.01" value={f.max_amount} onChange={set("max_amount")} placeholder="No cap" />
                </Field>
                <Field label="Status">
                  <select value={f.is_active ? "1" : "0"} onChange={(e) => setF({ ...f, is_active: e.target.value === "1" })}>
                    <option value="1">Active</option>
                    <option value="0">Paused</option>
                  </select>
                </Field>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setF(EMPTY)}>
              {f.id ? "Cancel edit" : "Clear"}
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save rule"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Rules</h3>
          {(rules.data ?? []).map((r) => (
            <div className="event-row" key={r.id}>
              <div className="event-content">
                <h4>{r.name}</h4>
                <p>{`${r.fee_head_name ?? "Every fee head"} · ${describeRule(r)} · booked as ${r.charge_head_name}`}</p>
              </div>
              <div className="row">
                {!r.is_active ? <Badge>Paused</Badge> : null}
                <button
                  type="button"
                  className="btn text"
                  onClick={() =>
                    setF({ id: r.id, name: r.name, fee_head_id: r.fee_head_id ? String(r.fee_head_id) : "", charge_head_id: String(r.charge_head_id), basis: r.basis, amount: String(Number(r.amount)), grace_days: String(r.grace_days), max_amount: r.max_amount ? String(Number(r.max_amount)) : "", is_active: r.is_active })
                  }
                >
                  Edit
                </button>
                <button type="button" className="btn text" onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!rules.data?.length ? <p className="muted small">{rules.loading ? "Loading…" : "No late-fee rules yet."}</p> : null}
        </div>
        <div className="aside-panel">
          <h3>If charged today</h3>
          <dl className="kv">
            <div>
              <dt>Date</dt>
              <dd>{p ? date(p.date) : "…"}</dd>
            </div>
            <div>
              <dt>Active rules</dt>
              <dd>{p ? p.rules : "…"}</dd>
            </div>
            <div>
              <dt>Late fees</dt>
              <dd>{p ? p.rows.length : "…"}</dd>
            </div>
            <div>
              <dt>New to charge</dt>
              <dd>{p ? money(p.total) : "…"}</dd>
            </div>
          </dl>
          <div className="gap" />
          <button type="button" className="btn primary" disabled={applying || !p || Number(p.total) <= 0} onClick={apply}>
            <Icon name="money" className="sm" />
            {applying ? "Charging…" : "Charge late fees now"}
          </button>
          <div className="gap" />
          <p>Parents are told when a late fee is added to their child’s account.</p>
        </div>
      </aside>
    </div>
  );
}
