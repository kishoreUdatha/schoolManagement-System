import type { ReactNode } from "react";

/** Status pill. The tone comes from the words, as the mocks do it, so
 *  whatever the API sends ("Overdue", "Pending review") is coloured right. */
export function badgeTone(text: string): string {
  const t = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  if (has(["cancelled", "canceled", "withdrawn"])) return "neutral";
  if (has(["requested", "pending", "follow-up", "due soon", "late", "assessment", "review", "returned", "invited", "trial"])) return "warn";
  if (has(["overdue", "absent", "declined", "failed", "expired", "suspended", "rejected"])) return "bad";
  if (has(["draft", "inactive", "archived", "closed", "leave"])) return "neutral";
  if (has(["published", "submitted", "issued", "new", "scheduled", "confirmed"])) return "blue";
  return "";
}

export type Tone = "" | "warn" | "bad" | "neutral" | "blue";

/** `tone` overrides the colour guessed from the words, e.g. tone="warn" for "Not marked". */
export function Badge({ children, tone }: { children: string; tone?: Tone }) {
  return <span className={`badge ${tone ?? badgeTone(children)}`}>{children}</span>;
}

const AVATAR_TONES = ["mint", "", "peach", "lilac"];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => t[0])
    .join("");
}

export function Avatar({ name, index = 0, large = false }: { name: string; index?: number; large?: boolean }) {
  return <span className={`avatar ${AVATAR_TONES[index % 4]} ${large ? "large" : ""}`}>{initials(name)}</span>;
}

export function Person({ name, index = 0, sub }: { name: string; index?: number; sub?: string }) {
  return (
    <div className="person">
      <Avatar name={name} index={index} />
      <div>
        {name}
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

/** The mock's `.panel`: a section, padded unless `flush`. Without a title it
    is just the frame — for a table whose toolbar above it already says what
    the rows are. */
export function Panel({
  title,
  sub,
  action,
  flush = false,
  children,
}: {
  title?: string;
  sub?: string;
  action?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="panel">
      {title || action ? (
        <div className="panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {sub ? <p>{sub}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={flush ? "" : "panel-body"}>{children}</div>
    </section>
  );
}
