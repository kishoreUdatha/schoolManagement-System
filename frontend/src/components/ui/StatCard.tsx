import { ReactNode } from "react";

import { Card } from "@/components/ui/Card";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "brand" | "emerald" | "amber" | "rose";
}

const accents = {
  brand: "text-brand-700",
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
};

export function StatCard({ label, value, hint, accent = "brand" }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${accents[accent]}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}
