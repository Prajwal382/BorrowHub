import { z } from "zod";
import { LoanStatus } from "@/generated/prisma/enums";
import { dateOnlySchema } from "@/lib/validation/dates";

// FR-15: there is deliberately no borrower field. The loan's borrower comes from the hold.
export const checkoutSchema = z
  .object({
    checkoutDate: dateOnlySchema("Choose a checkout date.", "Choose a valid checkout date."),
    agreedDueDate: dateOnlySchema("Choose a return date.", "Choose a valid return date."),
    checkoutCondition: z
      .string("Describe the item's condition at checkout.")
      .trim()
      .min(1, "Describe the item's condition at checkout.")
      .max(2000, "Condition notes must be 2000 characters or fewer."),
  })
  // FR-16
  .refine(({ checkoutDate, agreedDueDate }) => agreedDueDate >= checkoutDate, {
    path: ["agreedDueDate"],
    message: "The return date cannot be before the checkout date.",
  });

// A bad filter in a URL falls back to the default rather than failing the whole page.
export const loanQuerySchema = z.object({
  status: z.enum(LoanStatus).optional().catch(undefined),
  overdue: z
    .enum(["true"])
    .transform(() => true)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export type CheckoutInput = z.output<typeof checkoutSchema>;
export type LoanQuery = z.output<typeof loanQuerySchema>;
