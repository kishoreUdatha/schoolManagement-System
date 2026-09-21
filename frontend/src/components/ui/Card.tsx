import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // BrightCampus .panel
        "rounded-panel border border-surface-border bg-surface-raised shadow-card",
        className
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // .panel-head — no rule beneath it. Where a table follows, the line
        // is the table's own top border; where nothing does, the mock lets
        // the heading sit on the surface.
        "flex flex-wrap items-center justify-between gap-3.5 px-[22px] py-5",
        className
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-[19px] font-extrabold leading-tight tracking-[-0.45px] text-ink",
        className
      )}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-[22px]", className)} {...rest} />;
}
