import { api } from "@/lib/api";

/** Fetch an authenticated file (PDF, CSV) and open it in a new tab. Plain
 * links can't carry the bearer token, so we go through axios + a blob URL. */
export async function openAuthed(path: string, filename?: string): Promise<void> {
  const res = await api.get<Blob>(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  if (filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
