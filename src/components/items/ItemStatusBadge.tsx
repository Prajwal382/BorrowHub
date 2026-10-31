import { ItemStatus } from "@/generated/prisma/enums";
import { ITEM_STATUS_LABELS } from "@/lib/itemStatus";

const STATUS_CLASSES: Record<ItemStatus, string> = {
  [ItemStatus.Available]:
    "border-green-700 text-green-800 dark:border-green-400 dark:text-green-300",
  [ItemStatus.Held]: "border-amber-700 text-amber-800 dark:border-amber-400 dark:text-amber-300",
  [ItemStatus.CheckedOut]: "border-blue-700 text-blue-800 dark:border-blue-400 dark:text-blue-300",
  [ItemStatus.Unavailable]: "border-red-700 text-red-800 dark:border-red-400 dark:text-red-300",
};

// The status is always written out, so it does not depend on color alone (NFR-04).
export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-sm whitespace-nowrap ${STATUS_CLASSES[status]}`}
    >
      {ITEM_STATUS_LABELS[status]}
    </span>
  );
}
