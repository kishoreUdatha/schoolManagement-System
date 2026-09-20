import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { Card } from "@/components/ui/Card";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "brand" | "emerald" | "amber" | "rose";
  icon?: LucideIcon;
}

// The number carries the meaning, so it stays ink; the accent tints the chip
// beside it. A wall of coloured numbers is harder to read, not easier.
const accents = {
  brand: "bg-brand-50 text-brand-600",
  emerald: "bg-[#E9F7F0] text-[#07845E]",
  amber: "bg-[#FFF3D8] text-[#8E5C05]",
  rose: "bg-[#FFEBEE] text-[#B82E45]",
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
        {Icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${accents[accent]}`}
            aria-hidden="true"
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        )}
      </div>
    </Card>
  );
}
