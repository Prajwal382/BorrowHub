import { RequestStatus } from "@/generated/prisma/enums";
import { REQUEST_STATUS_LABELS } from "@/lib/requestStatus";

const STATUS_CLASSES: Record<RequestStatus, string> = {
  [RequestStatus.Pending]:
    "border-amber-700 text-amber-800 dark:border-amber-400 dark:text-amber-300",
  [RequestStatus.Approved]:
    "border-green-700 text-green-800 dark:border-green-400 dark:text-green-300",
  [RequestStatus.Rejected]: "border-red-700 text-red-800 dark:border-red-400 dark:text-red-300",
  [RequestStatus.Cancelled]: "border-foreground/50",
  [RequestStatus.Fulfilled]:
    "border-blue-700 text-blue-800 dark:border-blue-400 dark:text-blue-300",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-sm whitespace-nowrap ${STATUS_CLASSES[status]}`}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
