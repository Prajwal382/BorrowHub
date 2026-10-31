import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { getSession } from "@/lib/auth/session";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { findPublicUser, type PublicUser } from "@/lib/services/userService";

// FR-02: the role comes from the database on every request, never from the cookie or the
// client, so a role change or a removed account takes effect immediately.
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const { userId } = await getSession();
  return userId ? findPublicUser(userId) : null;
});

// For API route handlers: FR-01, FR-02.
export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

export async function requireRole(...roles: readonly Role[]): Promise<PublicUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError();
  }
  return user;
}

// For server components: FR-01, FR-02.
export async function requirePageUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

// AC-06: pages a user may not open render as not found, revealing nothing about them.
export async function requirePageRole(...roles: readonly Role[]): Promise<PublicUser> {
  const user = await requirePageUser();
  if (!roles.includes(user.role)) {
    notFound();
  }
  return user;
}
