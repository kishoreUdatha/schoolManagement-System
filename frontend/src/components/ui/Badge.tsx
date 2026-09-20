import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "emerald" | "amber" | "rose" | "brand";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-subtle text-ink-muted",
  emerald: "bg-success-bg text-success",
  amber: "bg-warning-bg text-warning",
  rose: "bg-danger-bg text-danger",
  brand: "bg-info-bg text-info",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        tones[tone],
        className
      )}
      {...rest}
    />
  );
}
