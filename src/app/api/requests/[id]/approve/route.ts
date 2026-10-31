import { apiHandler } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { approveRequest } from "@/lib/services/requestService";

// FR-02, FR-11, FR-12
export const POST = apiHandler<RouteContext<"/api/requests/[id]/approve">>(
  async (_request, context) => {
    const staff = await requireRole(...STAFF_ROLES);
    const { id } = await context.params;
    return Response.json({ request: await approveRequest(staff.id, id) });
  },
);
