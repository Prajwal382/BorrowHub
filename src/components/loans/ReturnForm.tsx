"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { ItemStatus } from "@/generated/prisma/enums";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

type ReturnFormProps = {
  loanId: string;
  today: string;
  checkoutDate: string;
};

export function ReturnForm({ loanId, today, checkoutDate }: ReturnFormProps) {
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
      `/api/loans/${loanId}/return`,
      "POST",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
    }
    // After a return, or if someone else got there first, this shows the loan as it now stands.
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Record return</h2>
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <TextField
        name="returnDate"
        label="Return date"
        type="date"
        min={checkoutDate}
        defaultValue={today}
        errors={fields?.returnDate}
      />
      <TextField
        name="returnCondition"
        label="Inspected condition"
        hint="For example: good, scratched, or missing a cable. The borrower can see this."
        errors={fields?.returnCondition}
      />
      <TextField
        name="returnConditionNotes"
        label="Condition notes"
        multiline
        required={false}
        errors={fields?.returnConditionNotes}
      />
      {/* FR-21: there is no default, so staff must make this decision. */}
      <fieldset
        aria-describedby={fields?.itemOutcome ? `${loanId}-outcome-error` : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="font-medium">
          What happens to the item? <span aria-hidden="true">*</span>
        </legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="itemOutcome" value={ItemStatus.Available} className="mt-1.5" />
          <span>It is acceptable. Make it available to borrow.</span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="itemOutcome"
            value={ItemStatus.Unavailable}
            className="mt-1.5"
          />
          <span>It needs attention. Mark it unavailable until it is cleared.</span>
        </label>
        {fields?.itemOutcome && (
          <p id={`${loanId}-outcome-error`} className="text-sm text-red-700 dark:text-red-400">
            {fields.itemOutcome.join(" ")}
          </p>
        )}
      </fieldset>
      <button
        type="submit"
        disabled={!hydrated || submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Record return"}
      </button>
    </form>
  );
}
