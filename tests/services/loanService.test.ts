import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AuditAction,
  ItemStatus,
  LoanStatus,
  RequestStatus,
  Role,
} from "@/generated/prisma/client";
import { addDays, orgToday, toDateOnlyString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  checkoutRequest,
  getLoan,
  isLoanOverdue,
  listLoans,
  LOANS_PAGE_SIZE,
} from "@/lib/services/loanService";
import {
  approveRequest,
  cancelHold,
  createRequest,
  rejectRequest,
} from "@/lib/services/requestService";
import { checkoutSchema, loanQuerySchema } from "@/lib/validation/loans";
import { createTestItem, createUser, resetDatabase, withFailingAuditLog } from "../helpers";

const today = () => orgToday();
const inDays = (days: number) => addDays(orgToday(), days);

function checkoutInput(overrides: Partial<{ checkoutDate: Date; agreedDueDate: Date }> = {}) {
  return {
    checkoutDate: today(),
    agreedDueDate: inDays(7),
    checkoutCondition: "Good",
    ...overrides,
  };
}

const query = (input: Record<string, unknown> = {}) => loanQuerySchema.parse(input);

async function fixtures() {
  const [staff, borrower, other, item] = await Promise.all([
    createUser("staff", Role.Staff),
    createUser("borrower"),
    createUser("other"),
    createTestItem("CAM-1"),
  ]);
  return { staff, borrower, other, item };
}

async function pendingRequest(borrowerId: string, itemId: string) {
  return createRequest(borrowerId, {
    itemId,
    intendedUse: "Class project",
    requestedReturnDate: inDays(7),
  });
}

async function hold(staffId: string, borrowerId: string, itemId: string) {
  const { id } = await pendingRequest(borrowerId, itemId);
  await approveRequest(staffId, id);
  return id;
}

async function itemStatus(id: string) {
  return (await prisma.item.findUniqueOrThrow({ where: { id } })).status;
}

async function requestStatus(id: string) {
  return (await prisma.request.findUniqueOrThrow({ where: { id } })).status;
}

// Writes a loan directly so its dates can be set freely around a fixed "now".
async function loanDueOn(dueDate: string, key = "CAM-9") {
  const staff = await createUser(`staff-${key}`, Role.Staff);
  const borrower = await createUser(`borrower-${key}`);
  const item = await createTestItem(key, { status: ItemStatus.CheckedOut });
  const request = await prisma.request.create({
    data: {
      borrowerId: borrower.id,
      itemId: item.id,
      intendedUse: "Test",
      requestedReturnDate: new Date(dueDate),
      status: RequestStatus.Fulfilled,
    },
  });
  return prisma.loan.create({
    data: {
      requestId: request.id,
      borrowerId: borrower.id,
      itemId: item.id,
      checkoutDate: new Date("2026-11-01"),
      agreedDueDate: new Date(dueDate),
      checkoutCondition: "Good",
      checkedOutById: staff.id,
    },
  });
}

describe("loanService", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  describe("checkoutRequest (FR-15, FR-16, FR-17, AC-03)", () => {
    it("atomically creates the loan, fulfills the request, and checks out the item", async () => {
      const { staff, borrower, item } = await fixtures();
      const requestId = await hold(staff.id, borrower.id, item.id);

      const loan = await checkoutRequest(staff.id, requestId, checkoutInput());

      expect(loan.status).toBe(LoanStatus.Active);
      expect(loan.borrowerId).toBe(borrower.id);
      expect(loan.item.status).toBe(ItemStatus.CheckedOut);
      expect(loan.checkedOutBy?.name).toBe("staff");
      await expect(requestStatus(requestId)).resolves.toBe(RequestStatus.Fulfilled);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.CheckedOut);
      await expect(prisma.loan.count()).resolves.toBe(1);
    });

    it("records the dates and condition, and audits the action (FR-16, NFR-06)", async () => {
      const { staff, borrower, item } = await fixtures();
      const requestId = await hold(staff.id, borrower.id, item.id);
      const input = { ...checkoutInput(), checkoutCondition: "Scratch on the lens cap" };

      const loan = await checkoutRequest(staff.id, requestId, input);

      expect(loan.checkoutDate).toEqual(input.checkoutDate);
      expect(loan.agreedDueDate).toEqual(input.agreedDueDate);
      expect(loan.checkoutCondition).toBe("Scratch on the lens cap");
      await expect(
        prisma.auditLog.findFirst({ where: { action: AuditAction.ItemCheckedOut } }),
      ).resolves.toMatchObject({ actorId: staff.id, entityType: "Loan", entityId: loan.id });
    });

    it("always lends to the borrower named on the hold, whatever is submitted (FR-15)", async () => {
      const { staff, borrower, other, item } = await fixtures();
      const requestId = await hold(staff.id, borrower.id, item.id);
      const input = checkoutSchema.parse({
        checkoutDate: "2026-01-01",
        agreedDueDate: "2026-01-02",
        checkoutCondition: "Good",
        borrowerId: other.id,
      });
      expect(input).not.toHaveProperty("borrowerId");

      const loan = await checkoutRequest(staff.id, requestId, {
        ...checkoutInput(),
        ...({ borrowerId: other.id } as object),
      });
      expect(loan.borrowerId).toBe(borrower.id);
    });

    it.each([
      ["Pending", RequestStatus.Pending],
      ["Rejected", RequestStatus.Rejected],
      ["Cancelled", RequestStatus.Cancelled],
      ["Fulfilled", RequestStatus.Fulfilled],
    ])(
      "refuses a %s request, as only a hold can be checked out (FR-15)",
      async (_label, status) => {
        const { staff, borrower, item } = await fixtures();
        const { id } = await pendingRequest(borrower.id, item.id);
        if (status !== RequestStatus.Pending) {
          await prisma.request.update({
            where: { id },
            data: { status, ...(status === RequestStatus.Rejected && { rejectionReason: "No" }) },
          });
        }

        await expect(checkoutRequest(staff.id, id, checkoutInput())).rejects.toBeInstanceOf(
          ConflictError,
        );
        await expect(prisma.loan.count()).resolves.toBe(0);
        await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Available);
      },
    );

    it("reports a request that does not exist", async () => {
      const { staff } = await fixtures();
      await expect(checkoutRequest(staff.id, "missing", checkoutInput())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("refuses another borrower's pending request while a hold exists (FR-15)", async () => {
      const { staff, borrower, other, item } = await fixtures();
      const pending = await pendingRequest(other.id, item.id);
      await hold(staff.id, borrower.id, item.id);

      await expect(checkoutRequest(staff.id, pending.id, checkoutInput())).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(prisma.loan.count()).resolves.toBe(0);
    });

    it("cannot follow a cancelled hold (FR-14)", async () => {
      const { staff, borrower, item } = await fixtures();
      const requestId = await hold(staff.id, borrower.id, item.id);
      await cancelHold(staff.id, requestId);

      await expect(checkoutRequest(staff.id, requestId, checkoutInput())).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Available);
    });

    it("leaves other pending requests pending and unapprovable (FR-13, INV-01)", async () => {
      const { staff, borrower, other, item } = await fixtures();
      const pending = await pendingRequest(other.id, item.id);
      const requestId = await hold(staff.id, borrower.id, item.id);

      await checkoutRequest(staff.id, requestId, checkoutInput());

      await expect(requestStatus(pending.id)).resolves.toBe(RequestStatus.Pending);
      await expect(approveRequest(staff.id, pending.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(rejectRequest(staff.id, pending.id, "Checked out")).resolves.toBeDefined();
    });

    describe("dates (FR-16, NFR-02)", () => {
      it("allows a return date equal to the checkout date", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);

        const loan = await checkoutRequest(
          staff.id,
          requestId,
          checkoutInput({ agreedDueDate: today() }),
        );
        expect(loan.agreedDueDate).toEqual(today());
      });

      it("rejects a return date before the checkout date", () => {
        const result = checkoutSchema.safeParse({
          checkoutDate: "2026-11-10",
          agreedDueDate: "2026-11-09",
          checkoutCondition: "Good",
        });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toEqual(["agreedDueDate"]);
      });

      it("rejects a checkout date in the future (SRS 2.2)", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);

        const error = await checkoutRequest(
          staff.id,
          requestId,
          checkoutInput({ checkoutDate: inDays(1), agreedDueDate: inDays(3) }),
        ).catch((caught) => caught);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.checkoutDate).toHaveLength(1);
        await expect(requestStatus(requestId)).resolves.toBe(RequestStatus.Approved);
      });

      it("rejects a checkout date before the hold was approved, changing nothing", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);

        const error = await checkoutRequest(
          staff.id,
          requestId,
          checkoutInput({ checkoutDate: inDays(-1) }),
        ).catch((caught) => caught);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.checkoutDate).toHaveLength(1);
        await expect(requestStatus(requestId)).resolves.toBe(RequestStatus.Approved);
        await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
        await expect(prisma.loan.count()).resolves.toBe(0);
      });

      it("judges 'future' in the organization's time zone", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);
        // 11:30 pm on Nov 9 in Chicago, when it is already Nov 10 in UTC.
        const lateEvening = new Date("2026-11-10T05:30:00Z");

        await expect(
          checkoutRequest(
            staff.id,
            requestId,
            checkoutInput({
              checkoutDate: new Date("2026-11-10"),
              agreedDueDate: new Date("2026-11-12"),
            }),
            lateEvening,
          ),
        ).rejects.toBeInstanceOf(ValidationError);
      });

      it.each(["", "soon", "2026-02-30"])("rejects the checkout date %j", (checkoutDate) => {
        expect(
          checkoutSchema.safeParse({
            checkoutDate,
            agreedDueDate: "2026-11-09",
            checkoutCondition: "Good",
          }).success,
        ).toBe(false);
      });

      it.each(["", "   "])("requires condition notes, refusing %j", (checkoutCondition) => {
        expect(
          checkoutSchema.safeParse({
            checkoutDate: "2026-11-09",
            agreedDueDate: "2026-11-09",
            checkoutCondition,
          }).success,
        ).toBe(false);
      });
    });

    describe("atomicity (NFR-03)", () => {
      it("rolls everything back if the audit row cannot be written", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);

        await withFailingAuditLog(async () => {
          await expect(checkoutRequest(staff.id, requestId, checkoutInput())).rejects.toThrow(
            "audit log unavailable",
          );
        });

        await expect(prisma.loan.count()).resolves.toBe(0);
        await expect(requestStatus(requestId)).resolves.toBe(RequestStatus.Approved);
        await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
      });

      it("fails without any change if the item is no longer on hold", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);
        await prisma.item.update({
          where: { id: item.id },
          data: { status: ItemStatus.Unavailable },
        });

        await expect(checkoutRequest(staff.id, requestId, checkoutInput())).rejects.toBeInstanceOf(
          ConflictError,
        );
        await expect(requestStatus(requestId)).resolves.toBe(RequestStatus.Approved);
        await expect(prisma.loan.count()).resolves.toBe(0);
      });
    });

    describe("concurrency (NFR-03, INV-01)", () => {
      it("creates one loan when the same checkout is submitted repeatedly at once", async () => {
        const { staff, borrower, item } = await fixtures();

        for (let attempt = 0; attempt < 10; attempt += 1) {
          await resetLoansFor(item.id);
          const requestId = await hold(staff.id, borrower.id, item.id);

          const results = await Promise.allSettled(
            [1, 2, 3].map(() => checkoutRequest(staff.id, requestId, checkoutInput())),
          );

          expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
          for (const result of results) {
            if (result.status === "rejected") {
              expect(result.reason).toBeInstanceOf(ConflictError);
            }
          }
          await expect(prisma.loan.count()).resolves.toBe(1);
          await expect(
            prisma.auditLog.count({ where: { action: AuditAction.ItemCheckedOut } }),
          ).resolves.toBe(1);
        }
      });

      it("creates no second loan when the same checkout is repeated later", async () => {
        const { staff, borrower, item } = await fixtures();
        const requestId = await hold(staff.id, borrower.id, item.id);

        await checkoutRequest(staff.id, requestId, checkoutInput());

        await expect(checkoutRequest(staff.id, requestId, checkoutInput())).rejects.toBeInstanceOf(
          ConflictError,
        );
        await expect(prisma.loan.count()).resolves.toBe(1);
      });

      it("lets only one win when checkout and hold cancellation race", async () => {
        const { staff, borrower, item } = await fixtures();

        for (let attempt = 0; attempt < 10; attempt += 1) {
          await resetLoansFor(item.id);
          const requestId = await hold(staff.id, borrower.id, item.id);

          const [checkout, cancel] = await Promise.allSettled([
            checkoutRequest(staff.id, requestId, checkoutInput()),
            cancelHold(staff.id, requestId),
          ]);

          expect(checkout.status).not.toBe(cancel.status);
          const won = checkout.status === "fulfilled";
          await expect(itemStatus(item.id)).resolves.toBe(
            won ? ItemStatus.CheckedOut : ItemStatus.Available,
          );
          await expect(prisma.loan.count()).resolves.toBe(won ? 1 : 0);
          await expect(requestStatus(requestId)).resolves.toBe(
            won ? RequestStatus.Fulfilled : RequestStatus.Cancelled,
          );
        }
      });
    });
  });

  describe("overdue (FR-19, AC-04)", () => {
    const due = { status: LoanStatus.Active, agreedDueDate: new Date("2026-11-09") };

    it.each([
      ["the day before it is due", "2026-11-08T18:00:00Z", false],
      ["the due date", "2026-11-09T18:00:00Z", false],
      ["the last minute of the due date in Chicago", "2026-11-10T05:59:00Z", false],
      ["the first minute after the due date in Chicago", "2026-11-10T06:00:00Z", true],
      ["a week later", "2026-11-16T18:00:00Z", true],
    ])("on %s", (_label, now, expected) => {
      expect(isLoanOverdue(due, new Date(now))).toBe(expected);
    });

    it("never applies to a Closed loan", () => {
      expect(isLoanOverdue({ ...due, status: LoanStatus.Closed }, new Date("2027-01-01"))).toBe(
        false,
      );
    });

    it("is not stored: the same loan becomes overdue as time passes", async () => {
      const loan = await loanDueOn("2026-11-09");
      const staff = await createUser("viewer", Role.Staff);

      const before = await getLoan(loan.id, staff, new Date("2026-11-09T18:00:00Z"));
      const after = await getLoan(loan.id, staff, new Date("2026-11-10T18:00:00Z"));

      expect(before.overdue).toBe(false);
      expect(after.overdue).toBe(true);
      expect(after.status).toBe(LoanStatus.Active);
    });

    it("lists overdue loans for staff using the same rule", async () => {
      const staff = await createUser("viewer", Role.Staff);
      const late = await loanDueOn("2026-11-09", "LATE-1");
      await loanDueOn("2026-11-10", "ONTIME-1");
      const now = new Date("2026-11-10T18:00:00Z");

      const { loans, total } = await listLoans(staff, query({ overdue: "true" }), now);

      expect(total).toBe(1);
      expect(loans.map((loan) => loan.id)).toEqual([late.id]);
      expect(loans[0].overdue).toBe(true);
    });

    it("leaves closed loans out of the overdue list", async () => {
      const staff = await createUser("viewer", Role.Staff);
      const loan = await loanDueOn("2026-11-09");
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          status: LoanStatus.Closed,
          returnDate: new Date("2026-11-09"),
          returnCondition: "Good",
          returnedById: staff.id,
          returnedAt: new Date(),
        },
      });

      const { total } = await listLoans(
        staff,
        query({ overdue: "true" }),
        new Date("2026-12-01T18:00:00Z"),
      );
      expect(total).toBe(0);
    });
  });

  describe("visibility (FR-04, FR-18, AC-06)", () => {
    it("lists only a borrower's own loans", async () => {
      const { staff, borrower, other, item } = await fixtures();
      const otherItem = await createTestItem("CAM-2");
      const mine = await checkoutRequest(
        staff.id,
        await hold(staff.id, borrower.id, item.id),
        checkoutInput(),
      );
      await checkoutRequest(
        staff.id,
        await hold(staff.id, other.id, otherItem.id),
        checkoutInput(),
      );

      const { loans, total } = await listLoans(borrower, query());

      expect(total).toBe(1);
      expect(loans.map((loan) => loan.id)).toEqual([mine.id]);
    });

    it.each([Role.Staff, Role.Administrator])("lists every loan for a %s", async (role) => {
      const { staff, borrower, other, item } = await fixtures();
      const otherItem = await createTestItem("CAM-2");
      const viewer = await createUser("viewer", role);
      await checkoutRequest(staff.id, await hold(staff.id, borrower.id, item.id), checkoutInput());
      await checkoutRequest(
        staff.id,
        await hold(staff.id, other.id, otherItem.id),
        checkoutInput(),
      );

      const { total } = await listLoans(viewer, query());
      expect(total).toBe(2);
    });

    it("cannot be got around with a filter", async () => {
      const { staff, borrower, other, item } = await fixtures();
      await checkoutRequest(staff.id, await hold(staff.id, borrower.id, item.id), checkoutInput());

      const { total } = await listLoans(other, query({ status: LoanStatus.Active }));
      expect(total).toBe(0);
    });

    it("hides another borrower's loan as if it did not exist", async () => {
      const { staff, borrower, other, item } = await fixtures();
      const loan = await checkoutRequest(
        staff.id,
        await hold(staff.id, borrower.id, item.id),
        checkoutInput(),
      );

      await expect(getLoan(loan.id, other)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getLoan("missing", other)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("shows a borrower their loan, without naming the staff member", async () => {
      const { staff, borrower, item } = await fixtures();
      const loan = await checkoutRequest(
        staff.id,
        await hold(staff.id, borrower.id, item.id),
        checkoutInput(),
      );

      const view = await getLoan(loan.id, borrower);

      expect(view.agreedDueDate).toEqual(inDays(7));
      expect(view).not.toHaveProperty("checkedOutBy");
      expect((await getLoan(loan.id, staff)).checkedOutBy?.name).toBe("staff");
    });

    it("sorts by what is due soonest and paginates", async () => {
      const staff = await createUser("viewer", Role.Staff);
      const count = LOANS_PAGE_SIZE + 2;
      for (let index = 0; index < count; index += 1) {
        const dueDate = toDateOnlyString(addDays(new Date("2026-11-01"), count - index));
        await loanDueOn(dueDate, `L-${index}`);
      }

      const first = await listLoans(staff, query());
      const beyond = await listLoans(staff, query({ page: 99 }));
      const dates = first.loans.map((loan) => loan.agreedDueDate.getTime());

      expect(first.loans).toHaveLength(LOANS_PAGE_SIZE);
      expect(dates).toEqual([...dates].sort((a, b) => a - b));
      expect(beyond.page).toBe(2);
      expect(beyond.loans).toHaveLength(2);
    });
  });
});

// Clears one item's lending activity so a race can be repeated from a clean start.
async function resetLoansFor(itemId: string) {
  await prisma.auditLog.deleteMany();
  await prisma.loan.deleteMany({ where: { itemId } });
  await prisma.request.deleteMany({ where: { itemId } });
  await prisma.item.update({ where: { id: itemId }, data: { status: ItemStatus.Available } });
}
