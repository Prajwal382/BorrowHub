import {
  AuditAction,
  ItemStatus,
  LoanStatus,
  Prisma,
  RequestStatus,
  Role,
} from "@/generated/prisma/client";
import { assertCanAccessOwnedRecord, isStaff } from "@/lib/auth/permissions";
import { orgToday } from "@/lib/dates";
import { isWriteConflict, prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { containsText } from "@/lib/search";
import type { CheckoutInput, LoanQuery, ReturnInput } from "@/lib/validation/loans";

export const LOANS_PAGE_SIZE = 20;

type Actor = { id: string; role: Role };

const loanSelect = {
  id: true,
  requestId: true,
  borrowerId: true,
  status: true,
  checkoutDate: true,
  agreedDueDate: true,
  checkoutCondition: true,
  returnDate: true,
  returnCondition: true,
  returnConditionNotes: true,
  returnedAt: true,
  createdAt: true,
  item: { select: { id: true, itemCode: true, name: true, status: true } },
  borrower: { select: { id: true, name: true, email: true } },
  checkedOutBy: { select: { name: true } },
  returnedBy: { select: { name: true } },
} satisfies Prisma.LoanSelect;

type LoanRecord = Prisma.LoanGetPayload<{ select: typeof loanSelect }>;

// checkedOutBy and returnedBy are present only for staff and administrators.
export type LoanView = Omit<LoanRecord, "checkedOutBy" | "returnedBy"> &
  Partial<Pick<LoanRecord, "checkedOutBy" | "returnedBy">> & { overdue: boolean };

// FR-19, SRS section 4: Overdue is derived on every read and never stored. A loan due today is
// not overdue until the organization's date has moved past it.
export function isLoanOverdue(
  loan: { status: LoanStatus; agreedDueDate: Date },
  now: Date = new Date(),
) {
  return loan.status === LoanStatus.Active && orgToday(now) > loan.agreedDueDate;
}

function forRole(loan: LoanRecord, role: Role, now: Date): LoanView {
  const { checkedOutBy, returnedBy, ...visible } = loan;
  return {
    ...visible,
    overdue: isLoanOverdue(loan, now),
    ...(isStaff(role) && { checkedOutBy, returnedBy }),
  };
}

// FR-15, FR-16, FR-17, NFR-03, INV-01: one transaction moves the hold to Fulfilled, the item to
// Checked out, and creates the loan. The conditional updates mean a repeated or racing submission
// matches nothing, and the unique request ID stops a second loan regardless.
export async function checkoutRequest(
  actorId: string,
  requestId: string,
  input: CheckoutInput,
  now: Date = new Date(),
): Promise<LoanView> {
  if (input.checkoutDate > orgToday(now)) {
    throw new ValidationError("Please correct the highlighted fields.", {
      checkoutDate: ["The checkout date cannot be in the future."],
    });
  }

  let loanId: string;
  try {
    loanId = await prisma.$transaction(async (tx) => {
      const { count } = await tx.request.updateMany({
        where: { id: requestId, status: RequestStatus.Approved },
        data: { status: RequestStatus.Fulfilled },
      });
      if (count === 0) {
        const exists = await tx.request.count({ where: { id: requestId } });
        throw exists
          ? new ConflictError("Only an item on hold can be checked out. Reload to see its status.")
          : new NotFoundError("That request could not be found.");
      }

      // FR-15: the borrower always comes from the hold.
      const hold = await tx.request.findUniqueOrThrow({
        where: { id: requestId },
        select: { itemId: true, borrowerId: true, decidedAt: true },
      });
      if (hold.decidedAt && input.checkoutDate < orgToday(hold.decidedAt)) {
        throw new ValidationError("Please correct the highlighted fields.", {
          checkoutDate: ["The checkout date cannot be before the hold was approved."],
        });
      }

      const item = await tx.item.updateMany({
        where: { id: hold.itemId, status: ItemStatus.Held },
        data: { status: ItemStatus.CheckedOut },
      });
      if (item.count === 0) {
        throw new ConflictError("This item is no longer on hold, so it cannot be checked out.");
      }

      const { id } = await tx.loan.create({
        data: {
          requestId,
          itemId: hold.itemId,
          borrowerId: hold.borrowerId,
          checkoutDate: input.checkoutDate,
          agreedDueDate: input.agreedDueDate,
          checkoutCondition: input.checkoutCondition,
          checkedOutById: actorId,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: AuditAction.ItemCheckedOut,
          entityType: "Loan",
          entityId: id,
          details: { requestId, itemId: hold.itemId, borrowerId: hold.borrowerId },
        },
      });
      return id;
    });
  } catch (error) {
    if (isWriteConflict(error)) {
      throw new ConflictError("Another change happened at the same time. Please try again.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("This item already has an active loan."); // INV-01, NFR-03
    }
    throw error;
  }

  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, select: loanSelect });
  return forRole(loan, Role.Staff, now);
}

// FR-04, FR-18: borrowers only ever list their own loans.
export async function listLoans(
  actor: Actor,
  { q, status, overdue, page: requested }: LoanQuery,
  now: Date = new Date(),
) {
  const contains = q ? containsText(q) : undefined;
  const where: Prisma.LoanWhereInput = {
    ...(!isStaff(actor.role) && { borrowerId: actor.id }),
    ...(status && { status }),
    // FR-23: the borrower filter above still applies, so this cannot reach other people's loans.
    ...(contains && {
      OR: [
        { item: { name: contains } },
        { item: { itemCode: contains } },
        { item: { category: contains } },
        { borrower: { name: contains } },
        { borrower: { email: contains } },
      ],
    }),
    // FR-19, AC-04: the same rule as isLoanOverdue, expressed as a query.
    ...(overdue && { status: LoanStatus.Active, agreedDueDate: { lt: orgToday(now) } }),
  };
  const total = await prisma.loan.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / LOANS_PAGE_SIZE));
  const page = Math.min(requested, pageCount);

  const loans = await prisma.loan.findMany({
    where,
    select: loanSelect,
    // History shows the latest returns first; otherwise what is due soonest needs attention first.
    orderBy:
      status === LoanStatus.Closed
        ? [{ returnedAt: "desc" }]
        : [{ agreedDueDate: "asc" }, { createdAt: "asc" }],
    skip: (page - 1) * LOANS_PAGE_SIZE,
    take: LOANS_PAGE_SIZE,
  });

  return {
    loans: loans.map((loan) => forRole(loan, actor.role, now)),
    total,
    page,
    pageCount,
    pageSize: LOANS_PAGE_SIZE,
  };
}

// FR-20, FR-21, FR-22, NFR-03, AC-05: one transaction closes the loan and releases or flags the
// item. The conditional updates mean a repeated return matches nothing, and the closed loan stays
// as permanent history.
export async function returnLoan(
  actorId: string,
  loanId: string,
  input: ReturnInput,
  now: Date = new Date(),
): Promise<LoanView> {
  if (input.returnDate > orgToday(now)) {
    throw new ValidationError("Please correct the highlighted fields.", {
      returnDate: ["The return date cannot be in the future."],
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        select: { itemId: true, borrowerId: true, checkoutDate: true },
      });
      if (!loan) {
        throw new NotFoundError("That loan could not be found.");
      }
      if (input.returnDate < loan.checkoutDate) {
        throw new ValidationError("Please correct the highlighted fields.", {
          returnDate: ["The return date cannot be before the checkout date."],
        });
      }

      const { count } = await tx.loan.updateMany({
        where: { id: loanId, status: LoanStatus.Active },
        data: {
          status: LoanStatus.Closed,
          returnDate: input.returnDate,
          returnCondition: input.returnCondition,
          returnConditionNotes: input.returnConditionNotes || null,
          returnedById: actorId,
          returnedAt: now,
        },
      });
      if (count === 0) {
        throw new ConflictError("This loan has already been returned. Reload to see its status.");
      }

      // FR-05: the inspection becomes the item's current condition. Earlier notes stay on the loans.
      const item = await tx.item.updateMany({
        where: { id: loan.itemId, status: ItemStatus.CheckedOut },
        data: {
          status: input.itemOutcome,
          conditionNotes: input.returnConditionNotes || input.returnCondition,
        },
      });
      if (item.count === 0) {
        throw new ConflictError("This item is not checked out, so it cannot be returned.");
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: AuditAction.ItemReturned,
          entityType: "Loan",
          entityId: loanId,
          details: {
            itemId: loan.itemId,
            borrowerId: loan.borrowerId,
            itemOutcome: input.itemOutcome,
          },
        },
      });
    });
  } catch (error) {
    if (isWriteConflict(error)) {
      throw new ConflictError("Another change happened at the same time. Please try again.");
    }
    throw error;
  }

  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, select: loanSelect });
  return forRole(loan, Role.Staff, now);
}

// FR-04, AC-06: another borrower's loan looks exactly like one that does not exist.
export async function getLoan(id: string, actor: Actor, now: Date = new Date()): Promise<LoanView> {
  const loan = await prisma.loan.findUnique({ where: { id }, select: loanSelect });
  if (!loan) {
    throw new NotFoundError();
  }
  assertCanAccessOwnedRecord(actor, loan.borrowerId);
  return forRole(loan, actor.role, now);
}
