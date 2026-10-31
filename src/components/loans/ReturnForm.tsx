"use client";

import { useRouter } from "next/navigation";
import { useId, type FormEvent } from "react";
import { showNotice } from "@/components/feedback/notices";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";
import { ItemStatus } from "@/generated/prisma/enums";

type ReturnFormProps = {
  loanId: string;
  itemName: string;
  today: string;
  checkoutDate: string;
};

export function ReturnForm({ loanId, itemName, today, checkoutDate }: ReturnFormProps) {
  const router = useRouter();
  const outcomeErrorId = useId();
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit({
    conflictsAsNotice: true,
  });
  const outcomeInvalid = Boolean(fields?.itemOutcome);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const result = await submit(`/api/loans/${loanId}/return`, "POST", values);

    if (result.ok) {
      showNotice(
        values.itemOutcome === ItemStatus.Available
          ? `Return recorded. ${itemName} is available to borrow.`
          : `Return recorded. ${itemName} is unavailable until staff clear it.`,
      );
    }
    // After a return, or if someone else got there first, this shows the loan as it now stands.
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <h2 className="text-xl font-semibold">Record return</h2>
      <FormAlert message={message} />
      <RequiredNote />
      <TextField
        name="returnDate"
        label="Return date"
        type="date"
        min={checkoutDate}
        max={today}
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
        role="radiogroup"
        aria-required
        aria-invalid={outcomeInvalid}
        aria-describedby={outcomeInvalid ? outcomeErrorId : undefined}
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
          <p id={outcomeErrorId} className="error-text text-sm">
            {fields.itemOutcome.join(" ")}
          </p>
        )}
      </fieldset>
      <button type="submit" disabled={disabled} className="button-primary">
        {submitting ? "Saving…" : "Record return"}
      </button>
    </form>
  );
}
