import { z } from "zod";
import { RequestStatus } from "@/generated/prisma/enums";
import { parseDateOnly } from "@/lib/dates";

// NFR-02: the date must be real here. FR-09's "later than today" needs the clock, so
// requestService checks that.
const dateOnlySchema = z.string("Choose a return date.").transform((value, context) => {
  const date = parseDateOnly(value);
  if (!date) {
    context.addIssue({ code: "custom", message: "Choose a valid return date." });
    return z.NEVER;
  }
  return date;
});

export const createRequestSchema = z.object({
  itemId: z.string("Choose an item.").min(1, "Choose an item."),
  intendedUse: z
    .string("Describe how you will use this item.")
    .trim()
    .min(1, "Describe how you will use this item.")
    .max(500, "Intended use must be 500 characters or fewer."),
  requestedReturnDate: dateOnlySchema,
});

export const rejectRequestSchema = z.object({
  reason: z
    .string("Give a reason for the rejection.")
    .trim()
    .min(1, "Give a reason for the rejection.")
    .max(500, "Reason must be 500 characters or fewer."),
});

// A bad filter in a URL falls back to the default rather than failing the whole page.
export const requestQuerySchema = z.object({
  status: z.enum(RequestStatus).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export type CreateRequestInput = z.output<typeof createRequestSchema>;
export type RequestQuery = z.output<typeof requestQuerySchema>;
