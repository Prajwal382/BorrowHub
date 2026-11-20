import { ItemStatus } from "@/generated/prisma/enums";
import { ITEM_STATUS_LABELS } from "@/lib/itemStatus";

const STATUS_CLASSES: Record<ItemStatus, string> = {
  [ItemStatus.Available]: "bg-[#e3f1e7] text-[#1e6b3a]",
  [ItemStatus.Held]: "bg-[#fbefd5] text-[#7a5a12]",
  [ItemStatus.CheckedOut]: "bg-[#ede7e1] text-muted",
  [ItemStatus.Unavailable]: "bg-[#f8e1e1] text-[#9b1c1c]",
};

// The status is always written out, so it does not depend on color alone (NFR-04).
export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${STATUS_CLASSES[status]}`}
    >
      {ITEM_STATUS_LABELS[status]}
    </span>
  );
}
