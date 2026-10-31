import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { checkoutRequest } from "@/lib/services/loanService";
import { checkoutSchema } from "@/lib/validation/loans";

// FR-02, FR-15, FR-16, FR-17
export const POST = apiHandler<RouteContext<"/api/requests/[id]/checkout">>(
  async (request, context) => {
    const staff = await requireRole(...STAFF_ROLES);
    const { id } = await context.params;
    const input = await parseJsonBody(request, checkoutSchema);
    return Response.json({ loan: await checkoutRequest(staff.id, id, input) }, { status: 201 });
  },
);
