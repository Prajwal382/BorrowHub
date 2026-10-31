import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { startSession } from "@/lib/auth/session";
import { authenticateUser } from "@/lib/services/authService";
import { loginSchema } from "@/lib/validation/auth";

export const POST = apiHandler(async (request) => {
  const input = await parseJsonBody(request, loginSchema);
  const user = await authenticateUser(input);
  await startSession(user.id);
  return Response.json({ user });
});
