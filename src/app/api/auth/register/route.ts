import { apiHandler, parseJsonBody } from "@/lib/api/handler";
import { startSession } from "@/lib/auth/session";
import { registerUser } from "@/lib/services/authService";
import { registerSchema } from "@/lib/validation/auth";

export const POST = apiHandler(async (request) => {
  const input = await parseJsonBody(request, registerSchema);
  const user = await registerUser(input);
  await startSession(user.id);
  return Response.json({ user }, { status: 201 });
});
