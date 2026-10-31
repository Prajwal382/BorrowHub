import { AuditAction, ItemStatus, Prisma, RequestStatus, Role } from "@/generated/prisma/client";
import { assertCanAccessOwnedRecord, isStaff } from "@/lib/auth/permissions";
import { orgToday } from "@/lib/dates";
import { isWriteConflict, prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isRequestable } from "@/lib/itemStatus";
import type { CreateRequestInput, RequestQuery } from "@/lib/validation/requests";

export const REQUESTS_PAGE_SIZE = 20;

type Actor = { id: string; role: Role };

const requestSelect = {
  id: true,
  borrowerId: true,
  intendedUse: true,
  requestedReturnDate: true,
  submittedAt: true,
  status: true,
  decidedAt: true,
  rejectionReason: true,
  cancelledAt: true,
  item: { select: { id: true, itemCode: true, name: true, status: true } },
  borrower: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { name: true } },
  cancelledBy: { select: { name: true } },
} satisfies Prisma.RequestSelect;

type RequestRecord = Prisma.RequestGetPayload<{ select: typeof requestSelect }>;

// decidedBy and cancelledBy are present only for staff and administrators.
export type RequestView = Omit<RequestRecord, "decidedBy" | "cancelledBy"> &
  Partial<Pick<RequestRecord, "decidedBy" | "cancelledBy">>;

// NFR-06 names the acting staff member for staff review. Borrowers see the outcome, not who.
function forRole(request: RequestRecord, role: Role): RequestView {
  const { decidedBy, cancelledBy, ...visible } = request;
  return isStaff(role) ? { ...visible, decidedBy, cancelledBy } : visible;
}

// Reads with relations run after writes commit, so row locks are held only for the writes.
async function viewAs(id: string, role: Role): Promise<RequestView> {
  const request = await prisma.request.findUniqueOrThrow({
    where: { id },
    select: requestSelect,
  });
  return forRole(request, role);
}

// FR-09, FR-10, FR-08: a request is for one available item, with a return date after today.
export async function createRequest(
  borrowerId: string,
  input: CreateRequestInput,
  now: Date = new Date(),
): Promise<RequestView> {
  if (input.requestedReturnDate <= orgToday(now)) {
    throw new ValidationError("Please correct the highlighted fields.", {
      requestedReturnDate: ["Choose a return date after today."],
    });
  }

  const item = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { status: true },
  });
  if (!item) {
    throw new NotFoundError("That item could not be found.");
  }
  if (!isRequestable(item.status)) {
    throw new ConflictError("This item is not available to request right now.");
  }

  try {
    const { id } = await prisma.request.create({
      data: { ...input, borrowerId, submittedAt: now },
      select: { id: true },
    });
    return await viewAs(id, Role.Borrower);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("You already have a pending request for this item.");
    }
    throw error;
  }
}

// FR-04: borrowers only ever list their own requests.
export async function listRequests(actor: Actor, { status, page: requested }: RequestQuery) {
  const where: Prisma.RequestWhereInput = {
    ...(!isStaff(actor.role) && { borrowerId: actor.id }),
    ...(status && { status }),
  };
  const total = await prisma.request.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / REQUESTS_PAGE_SIZE));
  const page = Math.min(requested, pageCount);

  const requests = await prisma.request.findMany({
    where,
    select: requestSelect,
    // The pending queue is served oldest first; everything else shows newest first.
    orderBy: { submittedAt: status === RequestStatus.Pending ? "asc" : "desc" },
    skip: (page - 1) * REQUESTS_PAGE_SIZE,
    take: REQUESTS_PAGE_SIZE,
  });

  return {
    requests: requests.map((request) => forRole(request, actor.role)),
    total,
    page,
    pageCount,
    pageSize: REQUESTS_PAGE_SIZE,
  };
}

// FR-04, AC-06: another borrower's request looks exactly like one that does not exist.
export async function getRequest(id: string, actor: Actor): Promise<RequestView> {
  const request = await prisma.request.findUnique({ where: { id }, select: requestSelect });
  if (!request) {
    throw new NotFoundError();
  }
  assertCanAccessOwnedRecord(actor, request.borrowerId);
  return forRole(request, actor.role);
}

export async function hasOpenRequest(borrowerId: string, itemId: string) {
  const count = await prisma.request.count({
    where: {
      borrowerId,
      itemId,
      status: { in: [RequestStatus.Pending, RequestStatus.Approved] },
    },
  });
  return count > 0;
}

async function decisionConflict(tx: Prisma.TransactionClient, id: string, action: string) {
  const exists = await tx.request.count({ where: { id } });
  return exists
    ? new ConflictError(`This request can no longer be ${action}. Reload to see its status.`)
    : new NotFoundError("That request could not be found.");
}

// NFR-03: everything in a decision commits together or not at all. Losing a race to another
// transaction is reported as a conflict the user can act on.
async function inDecisionTransaction<Result>(
  work: (tx: Prisma.TransactionClient) => Promise<Result>,
) {
  try {
    return await prisma.$transaction(work);
  } catch (error) {
    if (isWriteConflict(error)) {
      throw new ConflictError("Another change happened at the same time. Please try again.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("This item already has a hold."); // INV-01
    }
    throw error;
  }
}

function requestReferences(tx: Prisma.TransactionClient, id: string) {
  return tx.request.findUniqueOrThrow({
    where: { id },
    select: { itemId: true, borrowerId: true },
  });
}

// FR-12, FR-13, INV-01, AC-02: the WHERE clauses make the checks and the writes one atomic
// step. When staff race, the second waits on the row lock or the one-hold index, then fails.
export async function approveRequest(actorId: string, id: string): Promise<RequestView> {
  await inDecisionTransaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id, status: RequestStatus.Pending },
      data: { status: RequestStatus.Approved, decidedById: actorId, decidedAt: new Date() },
    });
    if (count === 0) {
      throw await decisionConflict(tx, id, "approved");
    }

    const references = await requestReferences(tx, id);
    const hold = await tx.item.updateMany({
      where: { id: references.itemId, status: ItemStatus.Available },
      data: { status: ItemStatus.Held },
    });
    if (hold.count === 0) {
      // Throwing rolls back the status change above, so no partial approval survives.
      throw new ConflictError("This item is no longer available, so it cannot be approved.");
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: AuditAction.RequestApproved,
        entityType: "Request",
        entityId: id,
        details: references,
      },
    });
  });
  return viewAs(id, Role.Staff);
}

// FR-11: a rejection records a reason the borrower can see.
export async function rejectRequest(
  actorId: string,
  id: string,
  reason: string,
): Promise<RequestView> {
  await inDecisionTransaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id, status: RequestStatus.Pending },
      data: {
        status: RequestStatus.Rejected,
        rejectionReason: reason,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    if (count === 0) {
      throw await decisionConflict(tx, id, "rejected");
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: AuditAction.RequestRejected,
        entityType: "Request",
        entityId: id,
        details: { ...(await requestReferences(tx, id)), reason },
      },
    });
  });
  return viewAs(id, Role.Staff);
}

// FR-14, AC-07: an Approved request is an uncollected hold, as checkout moves it to Fulfilled.
export async function cancelHold(actorId: string, id: string): Promise<RequestView> {
  await inDecisionTransaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id, status: RequestStatus.Approved },
      data: { status: RequestStatus.Cancelled, cancelledById: actorId, cancelledAt: new Date() },
    });
    if (count === 0) {
      throw await decisionConflict(tx, id, "cancelled");
    }

    const references = await requestReferences(tx, id);
    // Only a Held item returns to Available, so any other blocking status is left in place.
    await tx.item.updateMany({
      where: { id: references.itemId, status: ItemStatus.Held },
      data: { status: ItemStatus.Available },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: AuditAction.HoldCancelled,
        entityType: "Request",
        entityId: id,
        details: references,
      },
    });
  });
  return viewAs(id, Role.Staff);
}
