"use client";

import { ReactNode, useMemo, useState } from "react";

import { NavShellContext, type SearchablePage } from "@/components/NavShellContext";
import { Topbar } from "@/components/Topbar";

/** Sidebar, topbar and page, in the arrangement the mocks specify.
 *
 *  It exists so the topbar sits beside the sidebar rather than inside it —
 *  the panel is fixed to the left and the bar spans what is left. Putting
 *  the bar in the sidebar component would have nested it in the wrong box.
 *
 *  What the two share — the mobile drawer's open state, and the page list
 *  search reads — is held here and published on a context they both take it
 *  from. See NavShellContext for why it cannot be props.
 */
export function PortalShell({
  nav,
  showYear = false,
  noticesHref,
  messagesHref,
  width = "max-w-7xl",
  children,
}: {
  /** The portal's own nav. It takes what it needs from the shell context. */
  nav: ReactNode;
  showYear?: boolean;
  noticesHref?: string;
  messagesHref?: string;
  /** Each portal kept its own reading width; a parent page is not a
   *  seven-column register. */
  width?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pages, publishPages] = useState<SearchablePage[]>([]);

  const shell = useMemo(
    () => ({ open, setOpen, pages, publishPages }),
    [open, pages]
  );

  return (
    <NavShellContext.Provider value={shell}>
      <div className="flex min-h-screen">
        {nav}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            showYear={showYear}
            noticesHref={noticesHref}
            messagesHref={messagesHref}
          />
          <main className="flex-1 overflow-x-auto bg-surface">
            <div className={`mx-auto ${width} px-7 py-6`}>{children}</div>
          </main>
        </div>
      </div>
    </NavShellContext.Provider>
  );
}
