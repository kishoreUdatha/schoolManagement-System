// Save rows (or text the server already made) as a CSV file in the browser.

function save(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  save([header, ...rows].map((r) => r.map(cell).join(",")).join("\n"), filename);
}

export function downloadText(filename: string, text: string) {
  save(text, filename);
}
