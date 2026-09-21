"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";

/**
 * The mock's modal (`.modal-backdrop` / `.modal`) as a component. Closes on
 * Escape and on a click outside; focus moves into it on open and back out on
 * close. With `onSubmit` the body is a form and `actions` its buttons.
 *
 *   <Dialog open={editing} title="Add fee head" onClose={() => setEditing(false)}
 *           onSubmit={save} actions={<button className="btn primary">Save</button>}>
 *     <label className="field">…</label>
 *   </Dialog>
 */
export function Dialog({
  open,
  title,
  onClose,
  onSubmit,
  actions,
  wide = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  actions?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLElement>(null);
  const back = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement;
    box.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      (back.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const inner = (
    <>
      <h2 id={titleId}>{title}</h2>
      <div className="dialog-body">{children}</div>
      {actions ? <div className="actions row">{actions}</div> : null}
    </>
  );

  return (
    <div className="modal-backdrop show" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={box} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {onSubmit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(e);
            }}
          >
            {inner}
          </form>
        ) : (
          inner
        )}
      </section>
    </div>
  );
}
