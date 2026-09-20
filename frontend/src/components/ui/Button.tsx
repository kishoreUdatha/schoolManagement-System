"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50",
  secondary:
    "border border-surface-border bg-surface-raised text-ink hover:bg-surface-hover disabled:opacity-50",
  danger:
    "border border-rose-200 bg-surface-raised text-rose-600 hover:bg-rose-50 disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "min-h-[32px] px-3 py-1.5 text-[11px] rounded-lg",
  md: "min-h-[40px] px-4 py-2 text-xs rounded-[9px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? "…" : children}
    </button>
  );
});
