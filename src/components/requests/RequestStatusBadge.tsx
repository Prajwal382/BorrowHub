import { RequestStatus } from "@/generated/prisma/enums";
import { REQUEST_STATUS_LABELS } from "@/lib/requestStatus";

const STATUS_CLASSES: Record<RequestStatus, string> = {
  [RequestStatus.Pending]: "bg-[#fbefd5] text-[#7a5a12]",
  [RequestStatus.Approved]: "bg-[#e3f1e7] text-[#1e6b3a]",
  [RequestStatus.Rejected]: "bg-[#f8e1e1] text-[#9b1c1c]",
  [RequestStatus.Cancelled]: "bg-[#ede7e1] text-muted",
  [RequestStatus.Fulfilled]: "bg-sand text-maroon",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${STATUS_CLASSES[status]}`}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
