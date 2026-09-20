"use client";

import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

export default function AccountantDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Accountant dashboard</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Fee structures, payments, and collection.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available now</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/accountant/fees"
                className="text-brand-400 hover:underline"
              >
                Fees →
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-ink-subtle">
            Collection summary and outstanding-fees dashboard land in a
            follow-up story.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
