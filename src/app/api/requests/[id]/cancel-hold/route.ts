import { apiHandler } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { cancelHold } from "@/lib/services/requestService";

// FR-02, FR-14
export const POST = apiHandler<RouteContext<"/api/requests/[id]/cancel-hold">>(
  async (_request, context) => {
    const staff = await requireRole(...STAFF_ROLES);
    const { id } = await context.params;
    return Response.json({ request: await cancelHold(staff.id, id) });
  },
);
