// In-app confirmation and question dialogs, instead of the browser's own
// window.confirm / window.prompt boxes ("localhost:3100 says …").
//
//   if (!(await ask("Delete this notice?", { danger: true }))) return;
//   const reason = await askText("Why is it being rejected?", { required: true });
//
// Plain DOM, like the toast (lib/notify), so any screen can call it without a
// provider; styled by .bc-dialog in styles/app.css. One dialog at a time;
// Escape or clicking outside cancels, Enter confirms.

type AskOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type TextOptions = AskOptions & { defaultValue?: string; placeholder?: string; required?: boolean; multiline?: boolean };

const DANGER = /\b(delete|remove|cancel|void|reject|withdraw|disconnect|deny|block|end|archive|clear|unpublish|take back|stop|retire|deactivate|revoke|discard|reset|disable)\b/i;

function open<T>(build: (body: HTMLElement, done: (v: T) => void) => { focus: HTMLElement; ok: HTMLButtonElement }, cancelValue: T, opts: AskOptions, message: string): Promise<T> {
  if (typeof document === "undefined") return Promise.resolve(cancelValue);
  return new Promise<T>((resolve) => {
    const back = document.createElement("div");
    back.className = "bc-dialog-backdrop";
    const box = document.createElement("div");
    box.className = "bc-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const h = document.createElement("h3");
    h.textContent = opts.title ?? "Please confirm";
    const p = document.createElement("p");
    p.textContent = message;
    const body = document.createElement("div");
    const actions = document.createElement("div");
    actions.className = "bc-dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = opts.cancelLabel ?? "Cancel";
    box.append(h, p, body, actions);
    back.append(box);
    const previous = document.activeElement as HTMLElement | null;
    let finished = false;
    const done = (v: T) => {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKey, true);
      back.remove();
      previous?.focus?.();
      resolve(v);
    };
    const { focus, ok } = build(body, done);
    actions.append(cancel, ok);
    cancel.addEventListener("click", () => done(cancelValue));
    back.addEventListener("mousedown", (e) => {
      if (e.target === back) done(cancelValue);
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // only this dialog closes, not a window open underneath it
        e.preventDefault();
        e.stopPropagation();
        done(cancelValue);
      } else if (e.key === "Tab") {
        // keep focus inside the dialog
        const items = [...box.querySelectorAll<HTMLElement>("button, input, textarea")];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    document.body.append(back);
    requestAnimationFrame(() => focus.focus());
  });
}

function okButton(opts: AskOptions, message: string): HTMLButtonElement {
  const ok = document.createElement("button");
  ok.type = "button";
  const danger = opts.danger ?? DANGER.test(opts.confirmLabel ?? message.split(/[?.]/)[0]);
  ok.className = `btn ${danger ? "danger-solid" : "primary"}`;
  ok.textContent = opts.confirmLabel ?? "Confirm";
  return ok;
}

/** Ask a yes/no question in the app's own dialog. Resolves true on Confirm. */
export function ask(message: string, opts: AskOptions = {}): Promise<boolean> {
  return open<boolean>(
    (_body, done) => {
      const ok = okButton(opts, message);
      ok.addEventListener("click", () => done(true));
      ok.addEventListener("keydown", (e) => {
        if (e.key === "Enter") done(true);
      });
      return { focus: ok, ok };
    },
    false,
    opts,
    message,
  );
}

/** Ask for a line (or a few lines) of text. Resolves null when cancelled. */
export function askText(message: string, defaultOrOpts?: string | TextOptions): Promise<string | null> {
  const opts: TextOptions = typeof defaultOrOpts === "string" ? { defaultValue: defaultOrOpts } : (defaultOrOpts ?? {});
  return open<string | null>(
    (body, done) => {
      const input = document.createElement(opts.multiline ? "textarea" : "input") as HTMLInputElement | HTMLTextAreaElement;
      input.className = "bc-dialog-input";
      input.value = opts.defaultValue ?? "";
      if (opts.placeholder) input.placeholder = opts.placeholder;
      if (input instanceof HTMLTextAreaElement) input.rows = 3;
      const hint = document.createElement("small");
      hint.className = "bc-dialog-hint";
      body.append(input, hint);
      const ok = okButton({ ...opts, danger: opts.danger ?? false }, message);
      const submit = () => {
        const v = input.value.trim();
        if (opts.required && !v) {
          hint.textContent = "Please fill this in.";
          input.focus();
          return;
        }
        done(input.value);
      };
      ok.addEventListener("click", submit);
      input.addEventListener("keydown", (ev) => {
        const e = ev as KeyboardEvent;
        if (e.key === "Enter" && !(input instanceof HTMLTextAreaElement && e.shiftKey)) {
          e.preventDefault();
          submit();
        }
      });
      return { focus: input, ok };
    },
    null,
    { title: opts.title ?? "A little more information", ...opts },
    message,
  );
}
