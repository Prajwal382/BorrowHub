import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { rejectRequest } from "@/lib/services/requestService";
import { rejectRequestSchema } from "@/lib/validation/requests";

// FR-02, FR-11
export const POST = apiHandler<RouteContext<"/api/requests/[id]/reject">>(
  async (request, context) => {
    const staff = await requireRole(...STAFF_ROLES);
    const { id } = await context.params;
    const { reason } = await parseJsonBody(request, rejectRequestSchema);
    return Response.json({ request: await rejectRequest(staff.id, id, reason) });
  },
);
