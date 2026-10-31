import { AuditAction, Prisma, Role } from "@/generated/prisma/client";
import { isWriteConflict, prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

// NFR-01: the password hash is left out of everything except the login lookup.
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export function findPublicUser(id: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}

export function listUsers(): Promise<PublicUser[]> {
  return prisma.user.findMany({
    select: publicUserSelect,
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

// FR-03, NFR-06. Administrators cannot change their own role, which always leaves one
// administrator. Serializable isolation stops two administrators demoting each other at once.
export async function changeUserRole(
  actorId: string,
  targetId: string,
  role: Role,
): Promise<PublicUser> {
  if (actorId === targetId) {
    throw new ForbiddenError("You cannot change your own role.");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (actor?.role !== Role.Administrator) {
          throw new ForbiddenError();
        }

        const target = await tx.user.findUnique({
          where: { id: targetId },
          select: publicUserSelect,
        });
        if (!target) {
          throw new NotFoundError("That user no longer exists.");
        }
        if (target.role === role) {
          return target;
        }

        const updated = await tx.user.update({
          where: { id: targetId },
          data: { role },
          select: publicUserSelect,
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: AuditAction.UserRoleChanged,
            entityType: "User",
            entityId: targetId,
            details: { from: target.role, to: role },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isWriteConflict(error)) {
      throw new ConflictError("Another change happened at the same time. Please try again.");
    }
    throw error;
  }
}
