import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "emerald" | "amber" | "rose" | "brand";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-subtle text-ink-muted ring-1 ring-surface-border",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  rose: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
  brand: "bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tones[tone],
        className
      )}
      {...rest}
    />
  );
}
