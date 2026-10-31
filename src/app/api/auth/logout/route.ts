import { apiHandler } from "@/lib/api/handler";
import { endSession } from "@/lib/auth/session";

export const POST = apiHandler(async () => {
  await endSession();
  return Response.json({ ok: true });
});
