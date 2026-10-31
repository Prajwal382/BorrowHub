export type FieldErrors = Record<string, string[] | undefined>;

// Services throw these. The API layer turns them into HTTP responses (NFR-02).
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: FieldErrors) {
    super(400, "VALIDATION_ERROR", message, fields);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Please log in to continue.") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fields?: FieldErrors) {
    super(409, "CONFLICT", message, fields);
  }
}
