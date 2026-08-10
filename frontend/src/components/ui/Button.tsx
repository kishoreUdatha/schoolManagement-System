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
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow-sm hover:from-brand-400 hover:to-brand-500 disabled:opacity-50",
  secondary:
    "border border-surface-border bg-surface-subtle text-ink-muted hover:border-surface-hover hover:bg-surface-hover hover:text-ink disabled:opacity-50",
  danger:
    "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-sm hover:from-rose-400 hover:to-rose-500 disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
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
        "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed",
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
