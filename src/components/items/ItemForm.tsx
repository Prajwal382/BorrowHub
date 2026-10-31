"use client";

import { useRouter } from "next/navigation";
import { useId, type FormEvent } from "react";
import { showNotice } from "@/components/feedback/notices";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";
import { ItemStatus } from "@/generated/prisma/enums";
import { ITEM_STATUS_LABELS } from "@/lib/itemStatus";

type ItemFormProps = {
  categories: string[];
  item?: {
    id: string;
    itemCode: string;
    name: string;
    description: string;
    category: string;
    conditionNotes: string;
    status: ItemStatus;
  };
};

const CHOOSABLE_STATUSES = [ItemStatus.Available, ItemStatus.Unavailable];

function statusExplanation(status: ItemStatus) {
  return status === ItemStatus.Unavailable
    ? "This item must be cleared before it can be requested again."
    : "This status changes through the lending process, not this form.";
}

export function ItemForm({ categories, item }: ItemFormProps) {
  const router = useRouter();
  const statusFieldId = useId();
  const statusErrorId = `${statusFieldId}-error`;
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit();
  // FR-05, INV-02: only an Available item (or a new one) has a status to choose here.
  const canChooseStatus = !item || item.status === ItemStatus.Available;
  const statusErrors = fields?.status;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await submit<{ item: { id: string; name: string } }>(
      item ? `/api/items/${item.id}` : "/api/items",
      item ? "PATCH" : "POST",
      formValues(form),
    );

    if (result.ok) {
      const { id, name } = result.data.item;
      const path = `/catalog/${id}`;
      showNotice(item ? `Saved changes to ${name}.` : `Added ${name} to the catalog.`, { path });
      // Next.js keeps this page alive after leaving it, so a new-item form must be emptied.
      if (!item) {
        form.reset();
      }
      router.push(path);
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
      <FormAlert message={message} />
      <RequiredNote />
      <TextField
        name="itemCode"
        label="Item ID"
        hint="Must be unique. Letters, numbers, and hyphens, for example CAM-001."
        defaultValue={item?.itemCode}
        errors={fields?.itemCode}
      />
      <TextField name="name" label="Name" defaultValue={item?.name} errors={fields?.name} />
      <TextField
        name="description"
        label="Description"
        multiline
        defaultValue={item?.description}
        errors={fields?.description}
      />
      <TextField
        name="category"
        label="Category"
        suggestions={categories}
        defaultValue={item?.category}
        errors={fields?.category}
      />
      <TextField
        name="conditionNotes"
        label="Condition notes"
        hint="Visible to staff and administrators only."
        multiline
        required={false}
        defaultValue={item?.conditionNotes}
        errors={fields?.conditionNotes}
      />
      {canChooseStatus ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={statusFieldId} className="font-medium">
            Availability <span aria-hidden="true">*</span>
          </label>
          <select
            id={statusFieldId}
            name="status"
            required
            defaultValue={item?.status ?? ItemStatus.Available}
            aria-invalid={Boolean(statusErrors?.length)}
            aria-describedby={statusErrors ? statusErrorId : undefined}
            className="form-input"
          >
            {CHOOSABLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ITEM_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          {statusErrors && (
            <p id={statusErrorId} className="error-text text-sm">
              {statusErrors.join(" ")}
            </p>
          )}
        </div>
      ) : (
        <p>
          <span className="font-medium">Availability:</span> {ITEM_STATUS_LABELS[item.status]}.{" "}
          {statusExplanation(item.status)}
        </p>
      )}
      <button type="submit" disabled={disabled} className="button-primary">
        {submitting ? "Saving…" : item ? "Save changes" : "Add item"}
      </button>
    </form>
  );
}
