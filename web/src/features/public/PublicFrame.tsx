import type { ReactNode } from "react";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import type { PublicSchoolInfo } from "./links";

/**
 * The sign-in screen's `auth-page` layout for the school's public pages: the
 * school's name and contact on the left, the page's form on the right.
 */
export function PublicFrame({ info, heading, text, children }: { info: PublicSchoolInfo | null; heading: ReactNode; text: string; children: ReactNode }) {
  const contact = info ? [info.phone, info.email].filter(Boolean).join(" · ") : "";
  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="book" />
          </span>
          <span>
            {info?.school_name ?? "BrightCampus"}
            <small>{info?.address ?? "SCHOOL ERP"}</small>
          </span>
        </div>
        <div className="auth-copy">
          <h1>{heading}</h1>
          <p>{text}</p>
        </div>
        <HeroArt />
        <span className="art-note">{contact ? `Questions? ${contact}` : "Powered by BrightCampus"}</span>
      </section>
      <main className="auth-main">{children}</main>
    </div>
  );
}

/** A thank-you or "link not valid" panel in the form's place. */
export function PublicNote({ icon, title, children }: { icon: "check" | "bell"; title: string; children: ReactNode }) {
  return (
    <div className="auth-form" role="status">
      <div className="auth-icon">
        <Icon name={icon} />
      </div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
