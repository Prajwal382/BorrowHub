"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { Role } from "@/generated/prisma/enums";
import { sendJson } from "@/lib/api/client";

type RoleSelectProps = {
  userId: string;
  userName: string;
  role: Role;
};

export function RoleSelect({ userId, userName, role }: RoleSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Role;
    const previous = value;
    setValue(next);
    setSaving(true);
    setStatus(undefined);

    const result = await sendJson(`/api/admin/users/${userId}/role`, "PATCH", { role: next });
    setSaving(false);
    if (result.ok) {
      setStatus({ ok: true, text: "Saved." });
      router.refresh();
      return;
    }
    setValue(previous);
    setStatus({ ok: false, text: result.message });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Role for ${userName}`}
        value={value}
        onChange={handleChange}
        disabled={saving}
        className="rounded-md border border-foreground/40 bg-background px-2 py-1"
      >
        {Object.values(Role).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span
        role="status"
        className={status?.ok === false ? "text-sm text-red-700 dark:text-red-400" : "text-sm"}
      >
        {status?.text}
      </span>
    </div>
  );
}
