"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

type RequestFormProps = {
  itemId: string;
  minReturnDate: string;
};

export function RequestForm({ itemId, minReturnDate }: RequestFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [message, setMessage] = useState<string>();
  const [fields, setFields] = useState<FieldErrors>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setMessage(undefined);
    setFields(undefined);

    const result = await sendJson("/api/requests", "POST", {
      itemId,
      ...Object.fromEntries(new FormData(form)),
    });
    setSubmitting(false);

    if (result.ok) {
      // Next.js keeps this page alive after leaving it, so the form must be emptied.
      form.reset();
      router.push("/requests");
      router.refresh();
      return;
    }
    setMessage(result.message);
    setFields(result.fields);
  }

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Request this item</h2>
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <TextField
        name="intendedUse"
        label="Intended use"
        multiline
        hint="Tell staff what you need this item for."
        errors={fields?.intendedUse}
      />
      <TextField
        name="requestedReturnDate"
        label="Return date"
        type="date"
        min={minReturnDate}
        hint="Must be after today."
        errors={fields?.requestedReturnDate}
      />
      <button
        type="submit"
        disabled={!hydrated || submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
