import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { clearItem } from "@/lib/services/itemService";
import { clearItemSchema } from "@/lib/validation/items";

// FR-02, FR-21: staff or an administrator clears an item before it can be requested again.
export const POST = apiHandler<RouteContext<"/api/items/[id]/clear">>(async (request, context) => {
  const staff = await requireRole(...STAFF_ROLES);
  const { id } = await context.params;
  const input = await parseJsonBody(request, clearItemSchema);
  return Response.json({ item: await clearItem(staff.id, id, input) });
});
