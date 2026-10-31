import { Role } from "@/generated/prisma/enums";
import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { createItem, searchItems } from "@/lib/services/itemService";
import { catalogQuerySchema, createItemSchema } from "@/lib/validation/items";

// FR-07: any signed-in user can browse and search.
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const query = catalogQuerySchema.parse(Object.fromEntries(searchParams));
  return Response.json(await searchItems(query, user.role));
});

// FR-05: only an administrator can add items.
export const POST = apiHandler(async (request) => {
  const admin = await requireRole(Role.Administrator);
  const input = await parseJsonBody(request, createItemSchema);
  const item = await createItem(admin.id, input);
  return Response.json({ item }, { status: 201 });
});
