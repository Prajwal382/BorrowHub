import { Role } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/errors";

// SRS 2.1: administrators can also use every staff function.
export const STAFF_ROLES = [Role.Staff, Role.Administrator] as const;

type Actor = { id: string; role: Role };

export function isStaff(role: Role) {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}

// FR-04: borrowers reach only their own records; staff and administrators reach all of them.
export function canAccessOwnedRecord(actor: Actor, ownerId: string) {
  return isStaff(actor.role) || actor.id === ownerId;
}

// AC-06: a denied record looks exactly like a missing one, so its existence is not revealed.
export function assertCanAccessOwnedRecord(actor: Actor, ownerId: string) {
  if (!canAccessOwnedRecord(actor, ownerId)) {
    throw new NotFoundError();
  }
}
