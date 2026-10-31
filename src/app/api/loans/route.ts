import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";
import { listLoans } from "@/lib/services/loanService";
import { loanQuerySchema } from "@/lib/validation/loans";

// FR-04, FR-18: the service limits borrowers to their own loans.
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const query = loanQuerySchema.parse(Object.fromEntries(searchParams));
  return Response.json(await listLoans(user, query));
});
