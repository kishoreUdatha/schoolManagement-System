import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { Card } from "@/components/ui/Card";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "neutral" | "brand" | "emerald" | "amber" | "rose";
  icon?: LucideIcon;
}

// The number carries the meaning, so it stays ink; the accent tints the chip
// beside it. A wall of coloured numbers is harder to read, not easier.
const dots = {
  neutral: "bg-ink-subtle",
  brand: "bg-brand-600",
  emerald: "bg-success",
  amber: "bg-warning",
  rose: "bg-danger",
};

const accents = {
  neutral: "bg-surface-subtle text-ink-muted",
  brand: "bg-info-bg text-info",
  emerald: "bg-success-bg text-success",
  amber: "bg-warning-bg text-warning",
  rose: "bg-danger-bg text-danger",
};

export function StatCard({ label, value, hint, accent = "brand", icon: Icon }: StatCardProps) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-ink-muted">{label}</div>
          <div className="mt-1.5 text-[28px] font-extrabold leading-none tracking-[-1px] text-ink">
            {value}
          </div>
          {hint && <div className="mt-1.5 text-[11px] text-ink-subtle">{hint}</div>}
        </div>
        {Icon ? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${accents[accent]}`}
            aria-hidden="true"
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        ) : (
          // An accent with no icon used to tint nothing at all, so a tile
          // meant to read as a warning looked identical to a plain count.
          // A dot keeps the number in ink — the wall of colour this component
          // exists to avoid — while making the tone visible.
          accent !== "brand" && (
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dots[accent]}`}
              aria-hidden="true"
            />
          )
        )}
      </div>
    </Card>
  );
}
