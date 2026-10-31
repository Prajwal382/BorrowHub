import { ZodError, z } from "zod";
import { AppError, ValidationError, type FieldErrors } from "@/lib/errors";

type Handler<Context> = (request: Request, context: Context) => Promise<Response>;

function errorResponse(status: number, code: string, message: string, fields?: FieldErrors) {
  return Response.json({ error: { code, message, fields } }, { status });
}

// NFR-02: expected failures return an actionable message; anything unexpected is logged on
// the server and hidden from the client.
export function apiHandler<Context = unknown>(handler: Handler<Context>): Handler<Context> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error.status, error.code, error.message, error.fields);
      }
      console.error(error);
      return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
    }
  };
}

export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("The request body must be valid JSON.");
  }

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        "Please correct the highlighted fields.",
        z.flattenError(error).fieldErrors as FieldErrors,
      );
    }
    throw error;
  }
}
