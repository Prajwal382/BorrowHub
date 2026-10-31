import { Role } from "@/generated/prisma/enums";
import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { createRequest, listRequests } from "@/lib/services/requestService";
import { createRequestSchema, requestQuerySchema } from "@/lib/validation/requests";

// FR-04: the service limits borrowers to their own requests.
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const query = requestQuerySchema.parse(Object.fromEntries(searchParams));
  return Response.json(await listRequests(user, query));
});

// FR-09, SRS 2.1: submitting requests is a borrower function.
export const POST = apiHandler(async (request) => {
  const borrower = await requireRole(Role.Borrower);
  const input = await parseJsonBody(request, createRequestSchema);
  return Response.json({ request: await createRequest(borrower.id, input) }, { status: 201 });
});
