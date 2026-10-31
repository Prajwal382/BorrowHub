"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

type CheckoutFormProps = {
  requestId: string;
  today: string;
  defaultDueDate: string;
  onCancel: () => void;
};

export function CheckoutForm({ requestId, today, defaultDueDate, onCancel }: CheckoutFormProps) {
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
      `/api/requests/${requestId}/checkout`,
      "POST",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setSubmitting(false);

    if (result.ok) {
      router.push("/staff/loans");
      router.refresh();
      return;
    }
    setMessage(result.message);
    setFields(result.fields);
    // A conflict usually means someone else got there first, so show what changed.
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <TextField
        name="checkoutDate"
        label="Checkout date"
        type="date"
        defaultValue={today}
        errors={fields?.checkoutDate}
      />
      <TextField
        name="agreedDueDate"
        label="Agreed return date"
        type="date"
        min={today}
        defaultValue={defaultDueDate}
        errors={fields?.agreedDueDate}
      />
      <TextField
        name="checkoutCondition"
        label="Condition at checkout"
        multiline
        hint="Note any wear or damage. The borrower can see this."
        errors={fields?.checkoutCondition}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!hydrated || submitting}
          className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-60"
        >
          {submitting ? "Checking out…" : "Confirm checkout"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onCancel}
          className="rounded-md border border-foreground/50 px-3 py-1.5 disabled:opacity-60"
        >
          Back
        </button>
      </div>
    </form>
  );
}
