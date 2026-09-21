"use client";

/*
 * The mocks' local preview behaviour (assets/app.js), ported so the screens
 * behave as they did in the HTML pack: table search and filters, select-all,
 * record details, CSV export, form validation, attendance and marks totals,
 * approvals, slot booking, OTP, CSV import checks, kanban, messages and
 * notifications. Nothing leaves the browser.
 *
 * It works through the data-* attributes on the generated markup, rebinding
 * on every navigation. As a screen is wired to the backend, give its controls
 * real React handlers and drop the data-* hook it no longer needs.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SCREENS, screenAt, routeOf } from "@/lib/screens";

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

export function PreviewInteractions() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const ac = new AbortController();
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget | null | undefined, type: K | string, fn: (e: any) => void) =>
      el?.addEventListener(type, fn, { signal: ac.signal });

    const current = screenAt(pathname);
    document.body.dataset.screen = current?.id ?? "";
    const screenId = document.body.dataset.screen;

    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    let returnFocus: HTMLElement | null = null;
    const toast = (msg: string) => {
      const el = $("#toast");
      if (!el) return;
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
    };
    const modal = (title: string, body: string) => {
      returnFocus = document.activeElement as HTMLElement | null;
      $("#modal-title")!.textContent = title;
      $("#modal-body")!.textContent = body;
      $("#modal")!.classList.add("show");
      $("[data-close-modal]")?.focus();
    };
    const closeModal = () => {
      $("#modal")?.classList.remove("show");
      returnFocus?.focus();
    };

    $$("[data-close-modal]").forEach((el) => on(el, "click", closeModal));
    on($("#modal"), "click", (e: MouseEvent) => {
      if ((e.target as HTMLElement).id === "modal") closeModal();
    });
    on(document, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if ($("#modal")?.classList.contains("show")) closeModal();
        $(".sidebar")?.classList.remove("open");
        $(".offcanvas-backdrop")?.classList.remove("open");
        $("#global-results")?.classList.remove("open");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        $("#global-search")?.focus();
      }
      if (e.key === "Tab" && $("#modal")?.classList.contains("show")) {
        e.preventDefault();
        $("[data-close-modal]")?.focus();
      }
    });
    $$("[data-toggle-nav]").forEach((el) =>
      on(el, "click", () => {
        $(".sidebar")?.classList.toggle("open");
        $(".offcanvas-backdrop")?.classList.toggle("open");
      }),
    );
    $$<HTMLSelectElement>("[data-navigate]").forEach((el) =>
      on(el, "change", () => {
        if (el.value) router.push(el.value);
      }),
    );
    $$("[data-print]").forEach((el) => on(el, "click", () => window.print()));

    // Global screen search in the top bar
    const global = $<HTMLInputElement>("#global-search");
    on(global, "input", () => {
      const box = $("#global-results")!;
      const q = global!.value.toLowerCase().trim();
      box.replaceChildren();
      if (!q) {
        box.classList.remove("open");
        return;
      }
      const found = SCREENS.filter((s) => `${s.name} ${s.id} ${s.module} ${s.role}`.toLowerCase().includes(q)).slice(0, 9);
      found.forEach((s) => {
        const a = document.createElement("a");
        a.href = s.route;
        a.textContent = s.name;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          router.push(s.route);
        });
        const small = document.createElement("small");
        small.textContent = `${s.id} · ${s.moduleShort}`;
        a.append(small);
        box.append(a);
      });
      if (!found.length) {
        const el = document.createElement("a");
        el.textContent = "No matching screens";
        box.append(el);
      }
      box.classList.add("open");
    });
    on(document, "click", (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".topsearch")) $("#global-results")?.classList.remove("open");
    });

    // Tables: search, filters, select-all, record details, columns
    function applyFilters() {
      const q = ($<HTMLInputElement>("[data-table-search]")?.value || "").trim().toLowerCase();
      const selects = $$<HTMLSelectElement>("[data-filter-col]");
      $$("table[data-filterable]").forEach((t) => {
        let shown = 0;
        const rows = $$<HTMLTableRowElement>("tbody tr", t);
        rows.forEach((row) => {
          let yes = (row.textContent || "").toLowerCase().includes(q);
          for (const select of selects) {
            if (select.selectedIndex === 0) continue;
            const cells =
              select.dataset.filterCol === "status"
                ? $$("[data-col*=status],[data-col*=stage],[data-col*=decision]", row)
                : $$("[data-col=class],[data-col=department],[data-col=category],[data-col=school],[data-col=branch]", row);
            if (cells.length) yes = yes && cells.some((c) => (c.textContent || "").toLowerCase().includes(select.value.toLowerCase()));
          }
          row.hidden = !yes;
          if (yes) shown++;
        });
        const panel = t.closest(".panel") ?? document;
        const counter = $("[data-table-count]", panel);
        if (counter) counter.textContent = `Showing ${shown} of ${rows.length} records`;
        const empty = $(".table-empty", panel);
        if (empty) empty.hidden = shown > 0;
      });
    }
    $$("[data-table-search]").forEach((el) => on(el, "input", applyFilters));
    $$("[data-filter-col]").forEach((el) => on(el, "change", applyFilters));
    $$<HTMLInputElement>("[data-select-all]").forEach((el) =>
      on(el, "change", () => {
        $$<HTMLInputElement>(".row-check", el.closest("table")!).forEach((c) => {
          if (!c.closest("tr")!.hidden) c.checked = el.checked;
        });
      }),
    );
    $$("[data-view-row]").forEach((el) =>
      on(el, "click", () => {
        const t = el.closest("table")!;
        const row = el.closest("tr")!;
        const hs = $$("th", t).map((x) => (x.textContent || "").trim());
        const values = $$("td", row).map((x) => x.innerText.trim());
        modal(
          "Record details",
          values
            .map((v, i) => (hs[i] && hs[i] !== "Action" ? `${hs[i]}: ${v.replace(/\n/g, " · ")}` : ""))
            .filter(Boolean)
            .join("\n"),
        );
      }),
    );
    $$("[data-columns]").forEach((el) =>
      on(el, "click", () => {
        const t = el.closest(".panel")?.querySelector("table");
        modal(
          "Visible columns",
          t
            ? $$("th", t)
                .map((x) => (x.textContent || "").trim())
                .filter(Boolean)
                .join("\n")
            : "All columns are displayed in this preview.",
        );
      }),
    );

    const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const download = (text: string, name: string, type = "text/csv;charset=utf-8") => {
      const url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $$("[data-export]").forEach((el) =>
      on(el, "click", () => {
        const t = $("table");
        if (!t) {
          toast("Choose a table to export.");
          return;
        }
        const lines = $$<HTMLTableRowElement>("tr", t)
          .filter((r) => !r.hidden)
          .map((r) =>
            $$("th,td", r)
              .map((c) => c.innerText.replace(/\n/g, " · ").trim())
              .filter((v, i) => !$("input[type=checkbox]", r.children[i]) && v !== "Action" && v !== "View")
              .map(csvCell)
              .join(","),
          );
        download(lines.join("\r\n"), `${screenId}_export.csv`);
        toast("The visible table has been exported.");
      }),
    );
    $$("[data-template]").forEach((el) => on(el, "click", () => download(el.dataset.template + "\r\n", `${screenId}_template.csv`)));

    // Forms
    const mainForm = $<HTMLFormElement>("#main-form");
    on(mainForm, "submit", (e: SubmitEvent) => {
      e.preventDefault();
      if (!mainForm!.reportValidity()) return;
      const fields: Record<string, string> = {};
      new FormData(mainForm!).forEach((v, k) => {
        if (!k.toLowerCase().includes("password") && typeof v === "string") fields[k] = v;
      });
      try {
        localStorage.setItem(`brightcampus-preview-${screenId}`, JSON.stringify(fields));
      } catch {
        /* storage unavailable */
      }
      if (screenId === "SCR-158")
        modal("Payment recorded in this preview", "Sample amount: ₹12,500\nStudent: Aarav Sharma\nReceipt: RC-2026-1041\n\nNo funds were transferred. Open the Payment Receipt screen to view the sample receipt.");
      else if (screenId === "SCR-159") modal("Payment preview", "Payable amount: ₹12,500\nStudent: Aarav Sharma\n\nThis prototype does not contact a payment provider. No payment was processed.");
      else if (screenId === "SCR-054") toast("Student created in this preview. Open the Student Directory to continue.");
      else if (screenId === "SCR-251") toast(`Meeting booked in this preview for ${$(".slot.selected")?.textContent || "10:30 AM"}.`);
      else toast("Saved in this preview.");
    });
    $$("[data-submit-main]").forEach((el) =>
      on(el, "click", () => {
        if (mainForm) mainForm.requestSubmit();
        else toast("Changes saved in this preview.");
      }),
    );
    $$("[data-cancel],[data-reset]").forEach((el) =>
      on(el, "click", () => {
        mainForm?.reset();
        toast("Unsaved changes reset.");
      }),
    );
    $$("[data-action]").forEach((el) =>
      on(el, "click", (e: Event) => {
        e.preventDefault();
        const action = el.dataset.action || "";
        if (/^save|record|confirm|process|publish|verify|complete/i.test(action)) {
          toast(`${action} completed in this preview.`);
          return;
        }
        if (/^zoom/i.test(action)) {
          const svg = $<SVGElement & HTMLElement>(".map-svg");
          if (svg) {
            let scale = +(svg.dataset.scale || 1);
            scale = Math.max(1, Math.min(1.8, scale + (action.includes("in") ? 0.2 : -0.2)));
            svg.dataset.scale = String(scale);
            svg.style.transform = `scale(${scale})`;
          }
          return;
        }
        if (/note|requisition|opening|role|add|new|create|configure|edit|bulk|assign/i.test(action)) {
          modal(action, "This is an interface preview. The selected action is available for review; no production record has been changed.\n\nUse the editable source and screen manifest to connect this workflow to your application.");
          return;
        }
        modal(action, `Selected: ${action}\nSchool: Bright International School\nAcademic year: 2026–27\n\nSample information for this screen.`);
      }),
    );
    $$("[data-document]").forEach((el) =>
      on(el, "click", () =>
        modal(el.dataset.document || "", "Document preview\nOwner: Bright International School\nUploaded: 18 Sep 2026\nStatus: Available for review\n\nThe attachment shown is a sample record; no personal document is included."),
      ),
    );
    $$("[data-review-request]").forEach((el) =>
      on(el, "click", () =>
        modal("Review request", (el.closest<HTMLElement>("[data-request]")?.innerText || "").replace(/Review\s*Approve$/, "") + "\n\nReview the supporting information before approving."),
      ),
    );
    $$<HTMLButtonElement>("[data-approve]").forEach((el) =>
      on(el, "click", () => {
        const row = el.closest("[data-request]")!;
        const badge = $(".badge", row);
        if (badge) {
          badge.className = "badge";
          badge.textContent = "Approved";
        }
        el.textContent = "Approved";
        el.disabled = true;
        toast("Request approved in this preview.");
      }),
    );

    // Attendance and marks
    function attendanceCounts() {
      const vals = $$<HTMLSelectElement>(".attendance-choice").map((el) => el.value);
      for (const v of ["Present", "Absent", "Late", "Leave"]) {
        const count = $(`#${v.toLowerCase()}-count`);
        if (count) count.textContent = String(vals.filter((x) => x === v).length);
      }
      $$<HTMLSelectElement>(".attendance-choice").forEach((el) => (el.className = `attendance-choice ${el.value.toLowerCase()}`));
    }
    $$(".attendance-choice").forEach((el) => on(el, "change", attendanceCounts));
    $$("[data-mark-present]").forEach((el) =>
      on(el, "click", () => {
        $$<HTMLSelectElement>(".attendance-choice").forEach((x) => (x.value = "Present"));
        attendanceCounts();
        toast("All students marked present. Save to finish.");
      }),
    );
    const grade = (t: number) => (t >= 91 ? "A1" : t >= 81 ? "A2" : t >= 71 ? "B1" : t >= 61 ? "B2" : t >= 51 ? "C1" : t >= 41 ? "C2" : t >= 33 ? "D" : "E");
    function calculateMarks(row: HTMLElement) {
      const a = $<HTMLInputElement>(".theory", row);
      const b = $<HTMLInputElement>(".internal", row);
      if (!a || !b) return;
      const valid = a.checkValidity() && b.checkValidity() && a.value !== "" && b.value !== "";
      const total = Number(a.value) + Number(b.value);
      $(".mark-total", row)!.textContent = valid ? String(total) : "—";
      $(".mark-grade", row)!.textContent = valid ? grade(total) : "—";
      const msg = $(".mark-valid", row);
      if (msg) {
        msg.textContent = valid ? "Valid" : "Check range";
        msg.className = `small mark-valid ${valid ? "green" : ""}`;
        msg.style.color = valid ? "" : "#b82e45";
      }
    }
    $$<HTMLInputElement>(".marks-input[type=number]").forEach((el) =>
      on(el, "input", () => {
        const row = el.closest("tr")!;
        if (el.classList.contains("practical-component")) {
          const components = $$<HTMLInputElement>(".practical-component", row);
          const valid = components.every((x) => x.checkValidity() && x.value !== "");
          $(".mark-total", row)!.textContent = valid ? String(components.reduce((sum, x) => sum + Number(x.value), 0)) : "—";
          const msg = $(".mark-valid", row)!;
          msg.textContent = valid ? "Valid" : "Check range";
          msg.style.color = valid ? "#07845e" : "#b82e45";
        } else calculateMarks(row);
      }),
    );

    // Choosers
    $$(".slot").forEach((el) =>
      on(el, "click", () => {
        $$(".slot").forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
      }),
    );
    $$(".role-option").forEach((el) =>
      on(el, "click", () => {
        $$(".role-option").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
      }),
    );
    on($("[data-continue-role]"), "click", () => router.push($(".role-option.active")?.dataset.roleTarget || "/screens"));

    // Sign-in family
    on($("#auth-form"), "submit", (e: SubmitEvent) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      if (!f.reportValidity()) return;
      const n = +(f.dataset.authScreen || 0);
      if (n === 3) router.push(routeOf(33));
      else toast(n === 4 ? "Reset link requested in this preview. No email was sent." : "Password updated in this preview.");
    });
    on($("[data-auth-verify]"), "click", () => {
      if ($$<HTMLInputElement>(".otp-fields input").every((x) => /^\d$/.test(x.value))) toast("Code verified in this preview.");
      else toast("Enter all 6 digits.");
    });
    $$<HTMLInputElement>(".otp-fields input").forEach((el, i, all) =>
      on(el, "input", () => {
        el.value = el.value.replace(/\D/g, "").slice(0, 1);
        if (el.value) all[i + 1]?.focus();
      }),
    );

    // Uploads and CSV import checks
    $$<HTMLInputElement>("[data-upload]").forEach((el) =>
      on(el, "change", () => {
        const f = el.files?.[0];
        if (f) toast(`Selected ${f.name}. The file stays on your device.`);
      }),
    );
    function parseCSV(text: string) {
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
          if (quoted && text[i + 1] === '"') {
            cell += '"';
            i++;
          } else quoted = !quoted;
        } else if (ch === "," && !quoted) {
          row.push(cell);
          cell = "";
        } else if ((ch === "\n" || ch === "\r") && !quoted) {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(cell);
          if (row.some((v) => v.trim())) rows.push(row);
          row = [];
          cell = "";
        } else cell += ch;
      }
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      return rows;
    }
    on($("[data-validate-import]"), "click", async () => {
      const file = $<HTMLInputElement>("[data-upload]")?.files?.[0];
      if (!file) return toast("Choose a CSV file first.");
      if (!file.name.toLowerCase().endsWith(".csv")) return toast("Choose a .csv file for validation.");
      const rows = parseCSV(await file.text());
      const required = ($("[data-template]")?.dataset.template || "").split(",");
      const headers = (rows[0] || []).map((x) => x.trim().replace(/^﻿/, ""));
      const missing = required.filter((c) => !headers.some((h) => h.toLowerCase() === c.toLowerCase()));
      const invalid = rows.slice(1).filter((r) => r.length !== headers.length).length;
      const box = $("#import-status")!;
      box.style.display = "block";
      box.textContent = missing.length
        ? `Missing columns: ${missing.join(", ")}`
        : invalid
          ? `${invalid} rows have an unexpected number of columns.`
          : `${rows.length - 1} rows checked. Required columns are present. No records have been imported.`;
      box.style.background = missing.length || invalid ? "#fff2db" : "#f2f9f5";
      box.style.color = missing.length || invalid ? "#9a6a24" : "#2a7d60";
    });

    // Kanban
    let dragged: HTMLElement | null = null;
    $$("[data-kanban-card]").forEach((card) => {
      on(card, "dragstart", () => (dragged = card));
      on(card, "dragend", () => (dragged = null));
    });
    $$("[data-kanban-column]").forEach((col) => {
      on(col, "dragover", (e: DragEvent) => e.preventDefault());
      on(col, "drop", (e: DragEvent) => {
        e.preventDefault();
        if (!dragged) return;
        col.insertBefore(dragged, $(".kanban-add", col));
        $$("[data-kanban-column]").forEach((c) => {
          const n = $(".kanban-title span", c);
          if (n) n.textContent = String($$("[data-kanban-card]", c).length);
        });
        toast("Card moved in this preview.");
      });
    });

    // Messages
    $$("[data-conversation]").forEach((el) =>
      on(el, "click", () => {
        const active = el.dataset.conversation || "";
        $$("[data-conversation]").forEach((x) => {
          x.classList.remove("active");
          x.style.background = "#fff";
        });
        el.classList.add("active");
        el.style.background = "#edf4ff";
        const name = $(".message-head .person>div");
        if (name?.firstChild) name.firstChild.textContent = active;
        $('[aria-label="Write a message"]')?.focus();
      }),
    );
    on($("[data-conversation-search]"), "input", (e: Event) => {
      const q = (e.target as HTMLInputElement).value.toLowerCase();
      $$("[data-conversation]").forEach((x) => (x.hidden = !(x.textContent || "").toLowerCase().includes(q)));
    });
    on($("#message-form"), "submit", (e: SubmitEvent) => {
      e.preventDefault();
      const input = $<HTMLInputElement>("input", e.target as HTMLElement)!;
      if (!input.value.trim()) return;
      const div = document.createElement("div");
      div.className = "bubble out";
      div.textContent = input.value;
      const small = document.createElement("small");
      small.textContent = "Just now · Preview only";
      div.append(small);
      $(".messages")?.append(div);
      input.value = "";
      toast("Message added to this preview. Nothing was sent.");
    });

    // Notifications
    function filterNotices(type: string) {
      $$("[data-notification]").forEach(
        (n) => (n.hidden = type === "all" ? false : type === "unread" ? !n.classList.contains("unread") : n.classList.contains("unread")),
      );
    }
    $$("[data-read-all]").forEach((el) =>
      on(el, "click", () => {
        $$("[data-notification]").forEach((n) => {
          n.classList.remove("unread");
          $(".read-dot", n)?.remove();
        });
        const count = $("#unread-count");
        if (count) count.textContent = "0";
        toast("All notifications marked as read.");
        filterNotices($(".module-tabs button.active")?.dataset.noticeFilter || "all");
      }),
    );
    $$("[data-notice-filter]").forEach((el) =>
      on(el, "click", () => {
        $$("[data-notice-filter]").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        filterNotices(el.dataset.noticeFilter || "all");
      }),
    );

    // Leaving a screen closes anything it opened
    return () => {
      ac.abort();
      clearTimeout(toastTimer);
      $("#modal")?.classList.remove("show");
      $(".sidebar")?.classList.remove("open");
    };
  }, [pathname, router]);

  return null;
}
