import { Role } from "@/generated/prisma/enums";
import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { changeUserRole } from "@/lib/services/userService";
import { changeRoleSchema } from "@/lib/validation/auth";

// FR-03: only an administrator can change a role.
export const PATCH = apiHandler<RouteContext<"/api/admin/users/[id]/role">>(
  async (request, context) => {
    const actor = await requireRole(Role.Administrator);
    const { id } = await context.params;
    const { role } = await parseJsonBody(request, changeRoleSchema);
    const user = await changeUserRole(actor.id, id, role);
    return Response.json({ user });
  },
);
