import { LoanStatus } from "@/generated/prisma/enums";

const ACTIVE = "bg-[#fbefd5] text-[#7a5a12]";
const OVERDUE = "bg-[#f8e1e1] text-[#9b1c1c]";
const CLOSED = "bg-[#ede7e1] text-muted";

// FR-19: Overdue is a display of an Active loan, not a third status.
export function LoanStatusBadge({ status, overdue }: { status: LoanStatus; overdue: boolean }) {
  const label = overdue ? "Overdue" : status === LoanStatus.Active ? "Active" : "Returned";
  const classes = overdue ? OVERDUE : status === LoanStatus.Active ? ACTIVE : CLOSED;

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  );
}
