import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";
import { getLoan } from "@/lib/services/loanService";

// FR-04, AC-06: the service hides other borrowers' loans behind a 404.
export const GET = apiHandler<RouteContext<"/api/loans/[id]">>(async (_request, context) => {
  const user = await requireUser();
  const { id } = await context.params;
  return Response.json({ loan: await getLoan(id, user) });
});
