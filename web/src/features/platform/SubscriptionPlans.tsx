"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { dateTime, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { Plan } from "./types";

/** The feature switches a plan carries (the backend's module keys). */
const MODULE_KEYS = ["attendance", "homework", "exams", "fees", "behaviour", "digital_learning", "ai_reports", "ai_chatbot", "whatsapp", "sms"];

const LIMITS: [keyof Plan, string, number][] = [
  ["student_limit", "Student limit", 100],
  ["staff_limit", "Staff limit", 20],
  ["storage_mb_limit", "Storage (MB)", 1024],
  ["sms_quota", "SMS quota", 500],
  ["whatsapp_quota", "WhatsApp quota", 500],
  ["email_quota", "Email quota", 2000],
];

const num = (v: number | null | undefined) => (v ? v.toLocaleString("en-IN") : "0");

/** Page-head "Create plan": asks the list below to open its form. */
export function CreatePlanButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event("platform:create-plan"))}>
      <Icon name="plus" className="sm" />
      Create plan
    </button>
  );
}

function PlanForm({ plan, onDone, onCancel }: { plan: Plan | null; onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = new Set(plan ? plan.modules.filter((m) => m.enabled).map((m) => m.module_key) : MODULE_KEYS);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name")).trim(),
      tier: String(f.get("tier")),
      description: String(f.get("description") ?? "").trim() || null,
      price_monthly: String(f.get("price_monthly") || "0"),
      price_yearly: String(f.get("price_yearly") || "0"),
      ...Object.fromEntries(LIMITS.map(([k]) => [k, Number(f.get(k) || 0)])),
      modules: MODULE_KEYS.map((k) => ({ module_key: k, enabled: f.get(`module_${k}`) === "on" })),
    };
    setSaving(true);
    setError(null);
    try {
      if (plan) await api.patch(`/api/v1/super-admin/plans/${plan.id}`, body);
      else await api.post("/api/v1/super-admin/plans", body);
      notify(plan ? "Plan updated." : "Plan created.");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (labelText: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {labelText}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <form className="panel" onSubmit={submit} style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <div>
          <h2>{plan ? `Edit ${plan.name}` : "Create plan"}</h2>
          <p>Limits of 0 mean the plan sets no limit.</p>
        </div>
      </div>
      <div className="panel-body">
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          {field("Name", <input name="name" required minLength={2} maxLength={80} defaultValue={plan?.name ?? ""} />, true)}
          {field(
            "Tier",
            <select name="tier" defaultValue={plan?.tier ?? "basic"}>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>,
          )}
          {field("Monthly price (₹)", <input type="number" name="price_monthly" min={0} step="0.01" defaultValue={plan?.price_monthly ?? "0"} />)}
          {field("Yearly price (₹)", <input type="number" name="price_yearly" min={0} step="0.01" defaultValue={plan?.price_yearly ?? "0"} />)}
          {LIMITS.map(([k, t, d]) => (
            <label className="field" key={k}>
              <span>{t}</span>
              <input type="number" name={k} min={0} defaultValue={plan ? Number(plan[k] ?? 0) : d} />
            </label>
          ))}
          {field("Description", <input name="description" defaultValue={plan?.description ?? ""} />, false, true)}
        </div>
        <div className="gap" />
        <div className="form-section-title">
          <h3>Modules</h3>
        </div>
        <div className="plan-features">
          {MODULE_KEYS.map((k) => (
            <label key={k}>
              <input type="checkbox" name={`module_${k}`} defaultChecked={enabled.has(k)} />
              {` ${label(k)}`}
            </label>
          ))}
        </div>
      </div>
      <div className="form-footer">
        <span>Fields marked * are required</span>
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : plan ? "Save plan" : "Create plan"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** GET /super-admin/plans/{id}: every limit, quota and module of one plan. */
function PlanDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (p: Plan) => void }) {
  const plan = useApi<Plan>(`/api/v1/super-admin/plans/${id}`);
  const p = plan.data;
  const on = new Set(p?.modules.filter((m) => m.enabled).map((m) => m.module_key) ?? []);
  return (
    <Dialog
      open
      wide
      title={p ? `${p.name} plan` : "Plan"}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {p ? (
            <button type="button" className="btn primary" onClick={() => onEdit(p)}>
              Edit plan
            </button>
          ) : null}
        </>
      }
    >
      <ErrorNote>{plan.error}</ErrorNote>
      {p ? (
        <>
          <dl className="kv">
            {(
              [
                ["Tier", label(p.tier)],
                ["Status", p.is_active ? "Active" : "Retired"],
                ["Monthly price", money(p.price_monthly)],
                ["Yearly price", money(p.price_yearly)],
                ...LIMITS.map(([k, t]) => [t, Number(p[k] ?? 0) ? num(Number(p[k])) : "No limit"]),
                ["Created", dateTime(p.created_at)],
                ["Description", p.description || "—"],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="gap" />
          <div className="form-section-title">
            <h3>Modules</h3>
          </div>
          <div className="plan-features">
            {MODULE_KEYS.map((k) => (
              <span key={k} className={on.has(k) ? "" : "muted"}>
                <Icon name={on.has(k) ? "check" : "bell"} className="sm" />
                {` ${label(k)}${on.has(k) ? "" : " (off)"}`}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">{plan.loading ? "Loading…" : "Not found."}</p>
      )}
    </Dialog>
  );
}

/**
 * SCR-013, live: GET /super-admin/plans; details (GET /plans/{id}), create
 * (POST /plans), edit (PATCH /plans/{id}) and retire (DELETE /plans/{id},
 * which deactivates).
 */
export function SubscriptionPlans() {
  const plans = useApi<Paginated<Plan>>("/api/v1/super-admin/plans");
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The page-head button lives outside this component.
  useEffect(() => {
    const open = () => setEditing("new");
    window.addEventListener("platform:create-plan", open);
    return () => window.removeEventListener("platform:create-plan", open);
  }, []);

  async function retire(p: Plan) {
    if (!window.confirm(`Retire ${p.name}? Organizations already on it keep it; it can no longer be assigned.`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/super-admin/plans/${p.id}`);
      notify("Plan retired.");
      plans.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const items = plans.data?.items ?? [];
  return (
    <>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Plans set the limits and modules of every organization on them. Changing a plan changes it for everyone already on it.</span>
      </div>
      <ErrorNote>{error ?? plans.error}</ErrorNote>
      {editing ? (
        <PlanForm
          key={editing === "new" ? "new" : editing.id}
          plan={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            plans.reload();
          }}
        />
      ) : null}
      <section className="panel">
        {items.length ? (
          items.map((p) => (
            <div className="plan-row" key={p.id}>
              <div>
                <h3>
                  {`${p.name} `}
                  {p.is_active ? null : <Badge>Inactive</Badge>}
                </h3>
                <p>{p.description || `${label(p.tier)} tier`}</p>
              </div>
              <div className="plan-features">
                <span>
                  <Icon name="check" className="sm" />
                  {p.student_limit ? ` Up to ${num(p.student_limit)} students` : " Unlimited students"}
                </span>
                <span>
                  <Icon name="check" className="sm" />
                  {p.staff_limit ? ` Up to ${num(p.staff_limit)} staff` : " Unlimited staff"}
                </span>
                <span>
                  <Icon name="check" className="sm" />
                  {p.storage_mb_limit ? ` ${num(p.storage_mb_limit)} MB storage` : " Unlimited storage"}
                </span>
                <span>
                  <Icon name="check" className="sm" />
                  {` ${p.modules.filter((m) => m.enabled).length} of ${MODULE_KEYS.length} modules`}
                </span>
              </div>
              <div className="plan-price">
                {money(p.price_monthly)}
                <small>{`per month · ${money(p.price_yearly)} a year`}</small>
                <button type="button" className="btn" onClick={() => setViewing(p.id)}>
                  Details
                </button>
                <button type="button" className="btn" onClick={() => setEditing(p)}>
                  Edit plan
                </button>
                {p.is_active ? (
                  <button type="button" className="btn text" onClick={() => retire(p)}>
                    Retire
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="panel-pad muted">{plans.loading ? "Loading plans…" : "No plans yet. Create the first one."}</div>
        )}
      </section>
      {viewing !== null ? (
        <PlanDetail
          id={viewing}
          onClose={() => setViewing(null)}
          onEdit={(p) => {
            setViewing(null);
            setEditing(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : null}
    </>
  );
}
