"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";

/** One credential to hand over: who it is for, what they sign in with, and the password. */
export type Secret = { key: string; name: string; sub?: string; signIn: string; password: string; tag?: string };

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Passwords the server hands back exactly once. They live only in this
 * component's props (React state of the caller): never in storage, the URL
 * or a log. The panel pushes towards copying or printing them before it is
 * dismissed, and says plainly that they cannot be shown again.
 */
export function OneTimeSecrets({ title, heading, rows, footnote, onDone }: { title: string; heading: [string, string]; rows: Secret[]; footnote: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [shown, setShown] = useState(true);

  // Leaving the page loses them for good: let the browser ask first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function copy() {
    const text = [["Name", heading[0], "Password"].join("\t"), ...rows.map((r) => [r.name, r.signIn, r.password].join("\t"))].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.alert("The browser would not copy. Select the table and copy it by hand, or print it.");
    }
  }

  /** Slips, one per person, in a fresh window that is not kept anywhere. */
  function print() {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return window.alert("Allow pop-ups for this site to print the slips.");
    const slips = rows
      .map(
        (r) => `<div class="slip"><h3>${esc(r.name)}</h3>${r.sub ? `<p>${esc(r.sub)}</p>` : ""}<dl><dt>${esc(heading[0])}</dt><dd>${esc(r.signIn)}</dd><dt>Password</dt><dd class="pw">${esc(r.password)}</dd></dl><small>${esc(footnote)}</small></div>`,
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><title>${esc(title)}</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#1d2b44}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.slip{border:1px dashed #8aa2c8;border-radius:8px;padding:14px;break-inside:avoid}h3{margin:0 0 4px;font-size:15px}p{margin:0 0 8px;color:#56667e}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0 0 8px}dt{color:#56667e}dd{margin:0;font-weight:600}.pw{font:700 16px ui-monospace,monospace;letter-spacing:1px}small{color:#56667e}</style></head><body><div class="grid">${slips}</div><script>window.onload=function(){window.print()}<\/script></body></html>`,
    );
    w.document.close();
    setPrinted(true);
  }

  function done() {
    if (!copied && !printed && !window.confirm("These passwords cannot be shown again. Have you printed or copied them?")) return;
    onDone();
  }

  return (
    <section className="panel" aria-live="polite">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{`${rows.length} password${rows.length === 1 ? "" : "s"} · shown once, never stored`}</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setShown((s) => !s)}>
            {shown ? "Hide" : "Show"}
          </button>
          <button type="button" className="btn" onClick={copy}>
            <Icon name="file" className="sm" />
            {copied ? "Copied" : "Copy all"}
          </button>
          <button type="button" className="btn" onClick={print}>
            <Icon name="download" className="sm" />
            Print slips
          </button>
        </div>
      </div>
      <div className="panel-body">
        <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>These passwords are shown once. They are not kept anywhere they can be read back, so once you dismiss this panel or leave the page the only way to help someone who lost theirs is to make a new one. Print or copy them now.</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>{heading[0]}</th>
                <th>{heading[1]}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <div className="person">
                      <div>
                        {r.name}
                        {r.sub ? <small>{r.sub}</small> : null}
                      </div>
                    </div>
                  </td>
                  <td>{r.signIn}</td>
                  <td className="mono" style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
                    {shown ? r.password : "••••••••"}
                  </td>
                  <td>{r.tag ? <Badge>{r.tag}</Badge> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="form-footer">
        <span>{footnote}</span>
        <button type="button" className="btn primary" onClick={done}>
          <Icon name="check" className="sm" />
          I have handed these out
        </button>
      </div>
    </section>
  );
}
