import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { returnLoan } from "@/lib/services/loanService";
import { returnSchema } from "@/lib/validation/loans";

// FR-02, FR-20, FR-21
export const POST = apiHandler<RouteContext<"/api/loans/[id]/return">>(async (request, context) => {
  const staff = await requireRole(...STAFF_ROLES);
  const { id } = await context.params;
  const input = await parseJsonBody(request, returnSchema);
  return Response.json({ loan: await returnLoan(staff.id, id, input) });
});
