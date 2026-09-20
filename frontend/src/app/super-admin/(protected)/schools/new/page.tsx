"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Textarea,
  WarnBox,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Created = {
  tenant: { id: number; name: string; code: string };
  school: { id: number; name: string; code: string };
  school_admin_user_id: number;
  school_admin_email: string;
  school_admin_temporary_password: string | null;
};

/** Starting a new school on the platform.
 *
 *  A school always arrives with an organisation around it and an
 *  administrator inside it, because that is the only way the API can make
 *  one. Adding a second school to an organisation that already exists is not
 *  possible yet — said plainly below rather than offered as a form that
 *  cannot be submitted.
 */
export default function NewSchoolPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    contact_person: "",
    contact_email: "",
    contact_mobile: "",
    school_admin_name: "",
    school_admin_email: "",
    school_admin_phone: "",
  });
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<Created>("/api/v1/super-admin/tenants", {
        name: form.name,
        code: form.code || null,
        address: form.address || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email,
        contact_mobile: form.contact_mobile,
        school_admin_name: form.school_admin_name,
        school_admin_email: form.school_admin_email,
        school_admin_phone: form.school_admin_phone || null,
      });
      setCreated(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const ready =
    form.name.trim().length >= 2 &&
    form.contact_email.trim() !== "" &&
    form.contact_mobile.trim() !== "" &&
    form.school_admin_name.trim().length >= 2 &&
    form.school_admin_email.trim() !== "";

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="School created"
          subtitle="The organisation, its first school and its administrator are all set up."
        />
        <NoticeBox>
          {created.school.name} ({created.school.code}) is live under{" "}
          {created.tenant.name} ({created.tenant.code}).
        </NoticeBox>

        {created.school_admin_temporary_password && (
          <WarnBox>
            The administrator&apos;s password is{" "}
            <span className="font-mono font-bold">
              {created.school_admin_temporary_password}
            </span>
            . It is shown once and cannot be looked up again — send it to{" "}
            {created.school_admin_email} before leaving this page.
          </WarnBox>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Administrator</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1 text-[13px] text-ink-muted">
            <div>
              <span className="font-bold text-ink">Signs in with:</span>{" "}
              {created.school_admin_email}
            </div>
            <div>
              <span className="font-bold text-ink">At:</span> /school/login
            </div>
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => router.push("/super-admin/schools")}>Back to schools</Button>
          <Link href={`/super-admin/tenants/${created.tenant.id}`}>
            <Button variant="secondary">Open the organisation</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/super-admin/schools"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All schools
      </Link>

      <PageHeader
        title="New school"
        subtitle="Creates the organisation, its first school and the administrator who will run it."
      />
      <ErrorBox>{error}</ErrorBox>

      <WarnBox>
        A school can only be created together with a new organisation. There is no way yet
        to add a second school to an organisation that already exists — that needs an
        endpoint the API does not have.
      </WarnBox>

      <Card>
        <CardHeader>
          <CardTitle>The organisation</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Greenfield Education Trust"
          />
          <Input
            label="Code"
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            hint="Left blank, one is generated. It cannot be changed afterwards."
          />
          <Input
            label="Contact person"
            value={form.contact_person}
            onChange={(e) => set("contact_person", e.target.value)}
          />
          <Input
            label="Contact email"
            value={form.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
          />
          <Input
            label="Contact mobile"
            value={form.contact_mobile}
            onChange={(e) => set("contact_mobile", e.target.value)}
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The administrator</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Full name"
            value={form.school_admin_name}
            onChange={(e) => set("school_admin_name", e.target.value)}
          />
          <Input
            label="Email"
            value={form.school_admin_email}
            onChange={(e) => set("school_admin_email", e.target.value)}
            hint="This is how they sign in."
          />
          <Input
            label="Phone"
            value={form.school_admin_phone}
            onChange={(e) => set("school_admin_phone", e.target.value)}
          />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} loading={busy} disabled={!ready}>
          Create the school
        </Button>
        <span className="text-[12px] text-ink-subtle">
          A starting password is generated and shown once on the next screen.
        </span>
      </div>
    </div>
  );
}
