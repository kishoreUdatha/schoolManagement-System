"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { ENQ, useYears } from "./shared";
import { SOURCES, type BranchOption, type EnquiryDetail, type StaffOption } from "./types";

type Campaign = { id: number; name: string };

/**
 * SCR-045, live: POST /admissions/enquiries (or PATCH /enquiries/{id} with
 * ?id=). Counsellors from GET /directory/staff, campaigns from
 * GET /admissions/campaigns?active_only=true, campuses from GET /admissions/branches.
 */
export function EnquiryForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const existing = useApi<EnquiryDetail>(id ? `${ENQ}/${id}` : null);
  const staff = useApi<StaffOption[]>("/api/v1/school/directory/staff");
  const campaigns = useApi<Campaign[]>("/api/v1/school/admissions/campaigns", { active_only: true });
  const branches = useApi<BranchOption[]>("/api/v1/school/admissions/branches");
  const { current } = useYears();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (id && existing.loading && !existing.data) return <Loading what="Loading the enquiry…" />;
  const e = existing.data;
  const src = source ?? e?.source ?? "walk_in";
  // A new enquiry starts at the main campus when the school has more than one.
  const branch = branchId ?? (e ? (e.branch_id ? String(e.branch_id) : "") : String(branches.data?.find((b) => b.is_main)?.id ?? ""));

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setSaving(true);
    setError(null);
    const body = {
      student_name: text("student_name"),
      applying_for_class: text("applying_for_class"),
      parent_name: text("parent_name"),
      parent_phone: text("parent_phone"),
      parent_email: text("parent_email"),
      source: src,
      campaign_id: src === "campaign" && text("campaign_id") ? Number(text("campaign_id")) : null,
      branch_id: text("branch_id") ? Number(text("branch_id")) : null,
      assigned_to_user_id: text("assigned_to_user_id") ? Number(text("assigned_to_user_id")) : null,
      next_follow_up_date: text("next_follow_up_date"),
    };
    try {
      if (id) {
        await api.patch(`${ENQ}/${id}`, body);
        notify("Enquiry updated.");
        router.push(`${routeOf(46)}?id=${id}`);
      } else {
        const created = await api.post<{ id: number }>(ENQ, body);
        notify("Enquiry added.");
        router.push(`${routeOf(46)}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (text: string, control: JSX.Element, required = false) => (
    <label className="field">
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div className="two-col">
      <form id="enquiry-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? existing.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field("Student name", <input type="text" name="student_name" placeholder="Enter student name" required minLength={2} defaultValue={e?.student_name} />, true)}
                {field("Applying for", <input type="text" name="applying_for_class" placeholder="e.g. Grade 3" required defaultValue={e?.applying_for_class ?? ""} />, true)}
                {field("Parent name", <input type="text" name="parent_name" placeholder="Enter parent name" required minLength={2} defaultValue={e?.parent_name} />, true)}
                {field("Mobile number", <input type="tel" name="parent_phone" placeholder="Enter mobile number" required minLength={6} defaultValue={e?.parent_phone} />, true)}
                {field("Email address", <input type="email" name="parent_email" placeholder="Enter email address" defaultValue={e?.parent_email ?? ""} />)}
                {field(
                  "Source",
                  <select name="source" value={src} onChange={(x) => setSource(x.target.value)}>
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>,
                )}
                {src === "campaign"
                  ? field(
                      "Campaign",
                      <select name="campaign_id" defaultValue={e?.campaign_id ?? ""}>
                        <option value="">{campaigns.data?.length ? "Select campaign" : "No active campaigns"}</option>
                        {campaigns.data?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>,
                    )
                  : null}
                {field(
                  "Counsellor",
                  <select name="assigned_to_user_id" defaultValue={e?.assigned_to_user_id ?? ""} key={staff.data ? "ready" : "loading"}>
                    <option value="">{staff.loading ? "Loading staff…" : "Unassigned"}</option>
                    {staff.data?.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {`${s.full_name} · ${label(s.role)}`}
                      </option>
                    ))}
                  </select>,
                )}
                {branches.data?.length
                  ? field(
                      "Branch",
                      <select name="branch_id" value={branch} onChange={(x) => setBranchId(x.target.value)}>
                        <option value="">Not specified</option>
                        {branches.data.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>,
                    )
                  : null}
                {field("Follow-up date", <input type="date" name="next_follow_up_date" defaultValue={e?.next_follow_up_date ?? ""} />)}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : id ? "Save changes" : "Save enquiry"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Admissions</h3>
          <dl className="kv">
            <div>
              <dt>Academic year</dt>
              <dd>{current?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{branches.data?.find((b) => String(b.id) === branch)?.name ?? (branches.data && !branches.data.length ? "Single campus" : "—")}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{e ? label(e.stage) : "New enquiry"}</dd>
            </div>
          </dl>
          <div className="gap" />
          <p>Review the information, then save your changes.</p>
        </div>
      </aside>
    </div>
  );
}
