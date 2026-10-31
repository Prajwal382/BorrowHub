import { Role } from "@/generated/prisma/enums";
import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { getItem, updateItem } from "@/lib/services/itemService";
import { updateItemSchema } from "@/lib/validation/items";

// There is deliberately no DELETE: items stay so history can always reference them (FR-06).

export const GET = apiHandler<RouteContext<"/api/items/[id]">>(async (_request, context) => {
  const user = await requireUser();
  const { id } = await context.params;
  return Response.json({ item: await getItem(id, user.role) });
});

// FR-05: only an administrator can update items.
export const PATCH = apiHandler<RouteContext<"/api/items/[id]">>(async (request, context) => {
  const admin = await requireRole(Role.Administrator);
  const { id } = await context.params;
  const input = await parseJsonBody(request, updateItemSchema);
  return Response.json({ item: await updateItem(admin.id, id, input) });
});
