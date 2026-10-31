"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { showNotice } from "@/components/feedback/notices";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";

type RequestFormProps = {
  itemId: string;
  itemName: string;
  minReturnDate: string;
};

export function RequestForm({ itemId, itemName, minReturnDate }: RequestFormProps) {
  const router = useRouter();
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await submit("/api/requests", "POST", { itemId, ...formValues(form) });

    if (result.ok) {
      showNotice(`Your request for ${itemName} was submitted. Staff will review it.`, {
        path: "/requests",
      });
      // Next.js keeps this page alive after leaving it, so the form must be emptied.
      form.reset();
      router.push("/requests");
      router.refresh();
    }
  }

  return (
    <form
      ref={formRef}
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <h2 className="text-xl font-semibold">Request this item</h2>
      <FormAlert message={message} />
      <RequiredNote />
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
      <button type="submit" disabled={disabled} className="button-primary">
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
