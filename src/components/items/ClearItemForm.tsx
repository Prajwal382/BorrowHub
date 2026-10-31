"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { showNotice } from "@/components/feedback/notices";
import { FormAlert } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";

type ClearItemFormProps = {
  itemId: string;
  itemName: string;
  conditionNotes: string;
};

export function ClearItemForm({ itemId, itemName, conditionNotes }: ClearItemFormProps) {
  const router = useRouter();
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit({
    conflictsAsNotice: true,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await submit(
      `/api/items/${itemId}/clear`,
      "POST",
      formValues(event.currentTarget),
    );
    if (result.ok) {
      showNotice(`${itemName} is cleared. Borrowers can request it now.`);
    }
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
      <h2 className="text-xl font-semibold">Clear for lending</h2>
      <p>This item cannot be requested until it is cleared.</p>
      <FormAlert message={message} />
      {/* These notes become the item's current condition, so they must not be left out of date. */}
      <TextField
        name="conditionNotes"
        label="Condition notes after clearing"
        hint="Check that these still describe the item, and update them if it has been repaired. They stay as shown unless you change them."
        multiline
        required={false}
        defaultValue={conditionNotes}
        errors={fields?.conditionNotes}
      />
      <button type="submit" disabled={disabled} className="button-primary">
        {submitting ? "Clearing…" : "Clear item"}
      </button>
    </form>
  );
}
