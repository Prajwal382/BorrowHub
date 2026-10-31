import { LoanStatus } from "@/generated/prisma/enums";

const ACTIVE = "border-blue-700 text-blue-800 dark:border-blue-400 dark:text-blue-300";
const OVERDUE = "border-red-700 text-red-800 dark:border-red-400 dark:text-red-300";
const CLOSED = "border-foreground/50";

// FR-19: Overdue is a display of an Active loan, not a third status.
export function LoanStatusBadge({ status, overdue }: { status: LoanStatus; overdue: boolean }) {
  const label = overdue ? "Overdue" : status === LoanStatus.Active ? "Active" : "Returned";
  const classes = overdue ? OVERDUE : status === LoanStatus.Active ? ACTIVE : CLOSED;

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-sm whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  );
}
