"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { showNotice } from "@/components/feedback/notices";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";

type CheckoutFormProps = {
  requestId: string;
  itemName: string;
  borrowerName: string;
  today: string;
  defaultDueDate: string;
  onCancel: () => void;
};

export function CheckoutForm({
  requestId,
  itemName,
  borrowerName,
  today,
  defaultDueDate,
  onCancel,
}: CheckoutFormProps) {
  const router = useRouter();
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit({
    conflictsAsNotice: true,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await submit(
      `/api/requests/${requestId}/checkout`,
      "POST",
      formValues(event.currentTarget),
    );

    if (result.ok) {
      showNotice(`${itemName} is checked out to ${borrowerName}.`, { path: "/staff/loans" });
      router.push("/staff/loans");
      router.refresh();
      return;
    }
    // A conflict usually means someone else got there first, so show what changed.
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3"
    >
      <FormAlert message={message} />
      <RequiredNote />
      <TextField
        name="checkoutDate"
        label="Checkout date"
        type="date"
        max={today}
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
        <button type="submit" disabled={disabled} className="button-primary">
          {submitting ? "Checking out…" : "Confirm checkout"}
        </button>
        <button type="button" disabled={submitting} onClick={onCancel} className="button-secondary">
          Back
        </button>
      </div>
    </form>
  );
}
