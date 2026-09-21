// The shell's toast (#toast in the root layout), for confirmations after a save.

let timer: ReturnType<typeof setTimeout> | undefined;

export function notify(message: string) {
  const el = typeof document !== "undefined" ? document.getElementById("toast") : null;
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("show"), 4200);
}
