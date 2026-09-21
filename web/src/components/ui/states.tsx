import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** A failed request or a rejected save, in the mock's warning tip. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
      <Icon name="bell" className="sm" />
      <span>{children}</span>
    </div>
  );
}

/** Placeholder while a record loads, sized like a panel so nothing jumps. */
export function Loading({ what = "Loading…" }: { what?: string }) {
  return (
    <section className="panel">
      <div className="panel-pad muted" aria-busy="true">
        {what}
      </div>
    </section>
  );
}

/** A record screen opened without saying which record (?id= missing). */
export function PickFirst({ what, href, cta }: { what: string; href: string; cta: string }) {
  return (
    <section className="panel">
      <div className="panel-pad">
        <p className="muted" style={{ marginBottom: 14 }}>{`Choose a ${what} first.`}</p>
        <Link href={href} className="btn primary">
          <Icon name="arrow" className="sm" />
          {cta}
        </Link>
      </div>
    </section>
  );
}
