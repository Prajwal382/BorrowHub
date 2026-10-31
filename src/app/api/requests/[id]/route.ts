import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";
import { getRequest } from "@/lib/services/requestService";

// FR-04, AC-06: the service hides other borrowers' requests behind a 404.
export const GET = apiHandler<RouteContext<"/api/requests/[id]">>(async (_request, context) => {
  const user = await requireUser();
  const { id } = await context.params;
  return Response.json({ request: await getRequest(id, user) });
});
