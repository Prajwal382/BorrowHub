"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Role } from "@/generated/prisma/enums";
import { sendJson } from "@/lib/api/client";

type RoleSelectProps = {
  userId: string;
  userName: string;
  role: Role;
};

// NFR-04: saving is a separate step. Arrow keys change a select's value as they move through it,
// so saving on change would apply and audit every role a keyboard user passed on the way.
export function RoleSelect({ userId, userName, role }: RoleSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus(undefined);

    const result = await sendJson(`/api/admin/users/${userId}/role`, "PATCH", { role: value });
    setSaving(false);
    if (result.ok) {
      setStatus({ ok: true, text: `${userName} is now ${value}.` });
      router.refresh();
      return;
    }
    setValue(role);
    setStatus({ ok: false, text: result.message });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Role for ${userName}`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value as Role);
          setStatus(undefined);
        }}
        className="form-input"
      >
        {Object.values(Role).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button type="submit" disabled={saving || value === role} className="button-secondary">
        {saving ? "Saving…" : "Save"}
        <span className="sr-only"> role for {userName}</span>
      </button>
      <span role="status" className={status?.ok === false ? "error-text text-sm" : "text-sm"}>
        {status?.text}
      </span>
    </form>
  );
}
