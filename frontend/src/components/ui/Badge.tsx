import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "emerald" | "amber" | "rose" | "brand";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-subtle text-ink-muted",
  emerald: "bg-[#E9F7F0] text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-[#FFF3D8] text-[#8E5C05] dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-[#FFEBEE] text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-300",
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
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
