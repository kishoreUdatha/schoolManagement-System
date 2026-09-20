"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function StudentLoginPage() {
  return (
    <Suspense fallback={null}>
      <StudentLoginForm />
    </Suspense>
  );
}

/** Signing in with the number on your diary.
 *
 *  Everybody else here signs in with an email address. Children mostly do
 *  not have one, so this asks for the school's code and the admission number
 *  instead — both already printed on things the child is carrying.
 */
function StudentLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/student";

  const [schoolCode, setSchoolCode] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/student/auth/login", {
        school_code: schoolCode.trim(),
        admission_no: admissionNo.trim(),
        password,
      });
      if (data.user.role !== "student") {
        throw new Error("This account is not a student account.");
      }
      auth.setSession(data.access_token, data.refresh_token, data.user);
      router.replace(next);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-5">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-1px] text-ink">
              Sign in
            </h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              Use the school code and admission number from your diary, and the
              password the office gave you.
            </p>
          </div>

          <ErrorBox>{error}</ErrorBox>

          <form onSubmit={submit} className="space-y-4">
            <label className="block text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">School code</span>
              <Input
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                autoComplete="organization"
                autoCapitalize="characters"
                required
              />
            </label>
            <label className="block text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">Admission number</span>
              <Input
                value={admissionNo}
                onChange={(e) => setAdmissionNo(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>

          <p className="text-[12px] text-ink-subtle">
            Forgotten your password? The school office can give you a new one — it
            cannot be looked up, only replaced.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
