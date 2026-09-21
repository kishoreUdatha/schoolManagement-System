"use client";

import { Icon } from "@/components/ui/Icon";
import { emitAction } from "./shared";

/** The page-head Export button: the list on screen writes the CSV. */
export function ExportButton({ name }: { name: string }) {
  return (
    <button type="button" className="btn" onClick={() => emitAction(name)}>
      <Icon name="download" className="sm" />
      Export
    </button>
  );
}
