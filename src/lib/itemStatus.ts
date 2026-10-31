import { ItemStatus } from "@/generated/prisma/enums";

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  [ItemStatus.Available]: "Available",
  [ItemStatus.Held]: "Held",
  [ItemStatus.CheckedOut]: "Checked out",
  [ItemStatus.Unavailable]: "Unavailable",
};

// FR-08: held, checked-out, and unavailable items cannot receive new requests.
export function isRequestable(status: ItemStatus) {
  return status === ItemStatus.Available;
}
