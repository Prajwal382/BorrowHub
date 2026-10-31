"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { ItemStatus } from "@/generated/prisma/enums";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";
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
  const hydrated = useHydrated();
  const statusFieldId = useId();
  const [message, setMessage] = useState<string>();
  const [fields, setFields] = useState<FieldErrors>();
  const [submitting, setSubmitting] = useState(false);
  // FR-05, INV-02: only an Available item (or a new one) has a status to choose here.
  const canChooseStatus = !item || item.status === ItemStatus.Available;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setMessage(undefined);
    setFields(undefined);

    const result = await sendJson<{ item: { id: string } }>(
      item ? `/api/items/${item.id}` : "/api/items",
      item ? "PATCH" : "POST",
      Object.fromEntries(new FormData(form)),
    );
    setSubmitting(false);

    if (result.ok) {
      // Next.js keeps this page alive after leaving it, so a new-item form must be emptied.
      if (!item) {
        form.reset();
      }
      router.push(`/catalog/${result.data.item.id}`);
      router.refresh();
      return;
    }
    setMessage(result.message);
    setFields(result.fields);
  }

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
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
            aria-invalid={Boolean(fields?.status?.length)}
            className="rounded-md border border-foreground/40 bg-background px-3 py-2"
          >
            {CHOOSABLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ITEM_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          {fields?.status && (
            <p className="text-sm text-red-700 dark:text-red-400">{fields.status.join(" ")}</p>
          )}
        </div>
      ) : (
        <p>
          <span className="font-medium">Availability:</span> {ITEM_STATUS_LABELS[item.status]}.{" "}
          {statusExplanation(item.status)}
        </p>
      )}
      <button
        type="submit"
        disabled={!hydrated || submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {submitting ? "Saving…" : item ? "Save changes" : "Add item"}
      </button>
    </form>
  );
}
