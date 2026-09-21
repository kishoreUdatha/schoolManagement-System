"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel, Person } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "./csv";

type Operator = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  must_change_password: boolean;
  is_last_active: boolean;
};
type Issued = { id: number; full_name?: string; email: string | null; password: string };

const EVENT = "platform:add-operator";

/** Page-head "Add operator": opens the form in the list below. */
export function AddOperatorButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event(EVENT))}>
      <Icon name="plus" className="sm" />
      Add operator
    </button>
  );
}

/**
 * SCR-016, live: GET /super-admin/platform-users; add (POST), switch on or
 * off (PATCH {is_active}) and issue a new password (POST …/reset-password).
 * A password is shown once, when it is made; the last active operator
 * cannot be switched off.
 */
export function PlatformUsers() {
  const users = useApi<Operator[]>("/api/v1/super-admin/platform-users");
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const open = () => setAdding(true);
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);

  const all = useMemo(() => users.data ?? [], [users.data]);
  const shown = all.filter((u) => {
    const q = typed.trim().toLowerCase();
    return (!q || u.full_name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)) && (!status || (status === "active") === u.is_active);
  });

  async function act(key: number | "new", fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      users.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act("new", async () => {
      const r = await api.post<Issued>("/api/v1/super-admin/platform-users", {
        full_name: String(f.get("full_name")).trim(),
        email: String(f.get("email")).trim(),
        phone: String(f.get("phone") ?? "").trim() || undefined,
      });
      setIssued(r);
      setAdding(false);
    });
  }

  const setActive = (u: Operator, is_active: boolean) =>
    act(u.id, async () => {
      await api.patch(`/api/v1/super-admin/platform-users/${u.id}`, { is_active });
      notify(is_active ? `${u.full_name} can sign in again.` : `${u.full_name} is switched off.`);
    });

  const reset = (u: Operator) => {
    if (!window.confirm(`Issue a new password for ${u.full_name}? The old one stops working.`)) return;
    act(u.id, async () => {
      const r = await api.post<Issued>(`/api/v1/super-admin/platform-users/${u.id}/reset-password`);
      setIssued({ ...r, full_name: u.full_name });
    });
  };

  const active = all.filter((u) => u.is_active).length;
  const stats = [
    { label: "Operators", value: users.data ? String(all.length) : "…", note: "Platform accounts" },
    { label: "Active", value: users.data ? String(active) : "…", note: "Can sign in" },
    { label: "Switched off", value: users.data ? String(all.length - active) : "…", note: "Cannot sign in" },
    { label: "Must change password", value: users.data ? String(all.filter((u) => u.must_change_password).length) : "…", note: "At next sign-in" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      {issued ? (
        <div className="tip" role="status">
          <Icon name="shield" className="sm" />
          <span>
            {`Password for ${issued.full_name ?? issued.email ?? "the operator"}${issued.email ? ` (${issued.email})` : ""}: `}
            <strong className="mono">{issued.password}</strong>
            {" — shown once. They must change it at first sign-in. "}
            <button type="button" className="btn text" onClick={() => setIssued(null)}>
              Done
            </button>
          </span>
        </div>
      ) : null}
      {adding ? (
        <form className="panel" onSubmit={create} style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div>
              <h2>Add operator</h2>
              <p>A password is generated and shown once.</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                <span>
                  Full name<span className="req">*</span>
                </span>
                <input name="full_name" required minLength={2} maxLength={160} placeholder="Enter full name" />
              </label>
              <label className="field">
                <span>
                  Email address<span className="req">*</span>
                </span>
                <input type="email" name="email" required minLength={3} maxLength={255} placeholder="Enter email address" />
              </label>
              <label className="field">
                <span>Mobile number</span>
                <input type="tel" name="phone" maxLength={20} placeholder="Enter mobile number" />
              </label>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy === "new"}>
                <Icon name="check" className="sm" />
                {busy === "new" ? "Adding…" : "Add operator"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name or email…" aria-label="Search operators" />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{error ?? users.error}</ErrorNote>
      <Panel
        title="Platform operators"
        sub="People who administer the platform itself, not a school"
        action={
          <button
            type="button"
            className="btn"
            disabled={!shown.length}
            onClick={() =>
              downloadCsv(
                "platform-operators.csv",
                ["Name", "Email", "Mobile", "Last active", "Status"],
                shown.map((u) => [u.full_name, u.email ?? "", u.phone ?? "", u.last_login_at ?? "", u.is_active ? "Active" : "Inactive"]),
              )
            }
          >
            <Icon name="download" className="sm" />
            Export
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email address</th>
                <th>Role</th>
                <th>Last active</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u, i) => (
                <tr key={u.id}>
                  <td>
                    <Person name={u.full_name} index={i} sub={u.phone ?? undefined} />
                  </td>
                  <td>{u.email ?? "—"}</td>
                  <td>Platform admin</td>
                  <td>{u.last_login_at ? dateTime(u.last_login_at) : "Never"}</td>
                  <td>
                    <Badge>{u.is_active ? (u.must_change_password ? "Pending password change" : "Active") : "Inactive"}</Badge>
                  </td>
                  <td className="right">
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button type="button" className="btn" disabled={busy === u.id} onClick={() => reset(u)}>
                        New password
                      </button>
                      {u.is_active ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={busy === u.id || u.is_last_active}
                          title={u.is_last_active ? "The last active operator cannot be switched off" : undefined}
                          onClick={() => setActive(u, false)}
                        >
                          Switch off
                        </button>
                      ) : (
                        <button type="button" className="btn" disabled={busy === u.id} onClick={() => setActive(u, true)}>
                          Switch on
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={shown.length > 0}>
          {users.loading ? "Loading operators…" : "No operators match these filters."}
        </div>
        <div className="table-footer">
          <span>{`Showing ${shown.length} of ${all.length} records`}</span>
        </div>
      </Panel>
    </>
  );
}
