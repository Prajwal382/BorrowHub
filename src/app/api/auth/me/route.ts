import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return Response.json({ user });
});
