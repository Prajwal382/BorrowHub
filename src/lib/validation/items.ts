import { z } from "zod";
import { ItemStatus } from "@/generated/prisma/enums";

export const MAX_SEARCH_LENGTH = 100;

// NFR-02: identifiers are stored in one form, so "cam-001" and "CAM-001" are duplicates.
const itemCodeSchema = z
  .string("Enter an item ID.")
  .trim()
  .toUpperCase()
  .min(1, "Enter an item ID.")
  .max(32, "Item ID must be 32 characters or fewer.")
  // Empty is allowed through here so a blank field reports only the message above.
  .regex(/^([A-Z0-9][A-Z0-9-]*)?$/, "Item ID can only use letters, numbers, and hyphens.");

const itemFields = {
  itemCode: itemCodeSchema,
  name: z
    .string("Enter a name.")
    .trim()
    .min(1, "Enter a name.")
    .max(120, "Name must be 120 characters or fewer."),
  description: z
    .string("Enter a description.")
    .trim()
    .min(1, "Enter a description.")
    .max(2000, "Description must be 2000 characters or fewer."),
  category: z
    .string("Enter a category.")
    .trim()
    .min(1, "Enter a category.")
    .max(60, "Category must be 60 characters or fewer."),
  conditionNotes: z
    .string("Condition notes must be text.")
    .trim()
    .max(2000, "Condition notes must be 2000 characters or fewer."),
  // Held and CheckedOut are set only by approval and checkout, so they cannot be chosen here.
  status: z.enum(
    [ItemStatus.Available, ItemStatus.Unavailable],
    "Status can only be set to Available or Unavailable.",
  ),
};

export const createItemSchema = z.object({
  ...itemFields,
  conditionNotes: itemFields.conditionNotes.default(""),
  status: itemFields.status.default(ItemStatus.Available),
});

export const updateItemSchema = z.object(itemFields).partial();

export const clearItemSchema = z.object({ conditionNotes: itemFields.conditionNotes.optional() });

// A bad filter in a URL falls back to the default rather than failing the whole page.
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_LENGTH).optional().catch(undefined),
  category: z.string().trim().max(60).optional().catch(undefined),
  status: z.enum(ItemStatus).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export type CreateItemInput = z.output<typeof createItemSchema>;
export type UpdateItemInput = z.output<typeof updateItemSchema>;
export type ClearItemInput = z.output<typeof clearItemSchema>;
export type CatalogQuery = z.output<typeof catalogQuerySchema>;
