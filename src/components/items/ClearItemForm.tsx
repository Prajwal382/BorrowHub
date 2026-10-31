"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

type ClearItemFormProps = {
  itemId: string;
  conditionNotes: string;
};

export function ClearItemForm({ itemId, conditionNotes }: ClearItemFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [message, setMessage] = useState<string>();
  const [fields, setFields] = useState<FieldErrors>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(undefined);
    setFields(undefined);

    const result = await sendJson(
      `/api/items/${itemId}/clear`,
      "POST",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
    }
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Clear for lending</h2>
      <p>This item cannot be requested until it is cleared.</p>
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <TextField
        name="conditionNotes"
        label="Current condition notes"
        hint="Update these to describe the item now that it has been dealt with."
        multiline
        required={false}
        defaultValue={conditionNotes}
        errors={fields?.conditionNotes}
      />
      <button
        type="submit"
        disabled={!hydrated || submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {submitting ? "Clearing…" : "Clear item"}
      </button>
    </form>
  );
}
