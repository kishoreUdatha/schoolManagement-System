"use client";

import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
}

export function StarRating({ value, onChange, size = "md", readOnly }: Props) {
  const sz = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            className={cn(
              "transition disabled:cursor-default",
              active ? "text-warning" : "text-ink-subtle",
              !readOnly && "hover:scale-110"
            )}
            aria-label={`${n} stars`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={sz}
              aria-hidden="true"
            >
              <path d="M10 1l2.6 5.7 6.2.6-4.7 4.3 1.4 6.2L10 14.7l-5.5 3.1 1.4-6.2L1.2 7.3l6.2-.6L10 1z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
