import { RequestStatus } from "@/generated/prisma/enums";

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.Pending]: "Pending",
  [RequestStatus.Approved]: "Approved, on hold",
  [RequestStatus.Rejected]: "Rejected",
  [RequestStatus.Cancelled]: "Hold cancelled",
  [RequestStatus.Fulfilled]: "Fulfilled",
};
