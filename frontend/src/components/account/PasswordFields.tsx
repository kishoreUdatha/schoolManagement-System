"use client";

import { Input } from "@/components/ui/Input";

export const MIN_LENGTH = 8;

/** Whether a new password is ready to send.
 *
 *  Eight characters and a matching confirmation — the same two rules the API
 *  enforces, and nothing more. Inventing extra rules here would refuse
 *  passwords the server would happily accept, which reads as a broken form
 *  rather than a policy.
 */
export function passwordsOk(value: string, confirm: string): boolean {
  return value.length >= MIN_LENGTH && value === confirm;
}

export function PasswordFields({
  value,
  confirm,
  onValue,
  onConfirm,
  disabled,
}: {
  value: string;
  confirm: string;
  onValue: (v: string) => void;
  onConfirm: (v: string) => void;
  disabled?: boolean;
}) {
  const tooShort = value.length > 0 && value.length < MIN_LENGTH;
  // Only complain about a mismatch once there is something to mismatch, so
  // the warning does not sit there while somebody is still typing.
  const mismatch = confirm.length > 0 && value !== confirm;

  return (
    <>
      <Input
        label="New password"
        name="new_password"
        type="password"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        autoComplete="new-password"
        disabled={disabled}
        required
        error={tooShort ? `At least ${MIN_LENGTH} characters.` : undefined}
        hint={tooShort ? undefined : `At least ${MIN_LENGTH} characters.`}
      />
      <Input
        label="Confirm new password"
        name="confirm_password"
        type="password"
        value={confirm}
        onChange={(e) => onConfirm(e.target.value)}
        autoComplete="new-password"
        disabled={disabled}
        required
        error={mismatch ? "The two passwords are not the same." : undefined}
      />
    </>
  );
}
