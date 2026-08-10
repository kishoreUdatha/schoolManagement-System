"use client";

import { InputHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-ink-muted"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={cn(
          "rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink shadow-sm",
          "placeholder:text-ink-subtle focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
          error &&
            "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/30",
          className
        )}
        {...rest}
      />
      {error ? (
        <span className="text-xs text-rose-400">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink-subtle">{hint}</span>
      ) : null}
    </div>
  );
});
