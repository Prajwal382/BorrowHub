import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { LoanStatus, RequestStatus } from "@/generated/prisma/client";
import { resetDatabase } from "../helpers";

const CHECKOUT = new Date("2026-11-02");
const DUE = new Date("2026-11-09");

async function createFixtures() {
  const [borrowerA, borrowerB, staff] = await Promise.all(
    ["a", "b", "staff"].map((key) =>
      prisma.user.create({
        data: { email: `${key}@test.local`, name: key, passwordHash: "not-a-real-hash" },
      }),
    ),
  );
  const item = await prisma.item.create({
    data: { itemCode: "CAM-1", name: "Camera", description: "Test", category: "Cameras" },
  });
  return { borrowerA, borrowerB, staff, item };
}

function createRequest(borrowerId: string, itemId: string, status: RequestStatus) {
  return prisma.request.create({
    data: { borrowerId, itemId, status, intendedUse: "Test", requestedReturnDate: DUE },
  });
}

describe("database integrity constraints", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("rejects a duplicate item identifier (FR-06)", async () => {
    await createFixtures();
    await expect(
      prisma.item.create({
        data: { itemCode: "CAM-1", name: "Other", description: "Test", category: "Cameras" },
      }),
    ).rejects.toThrow();
  });

  it("allows only one hold per item (INV-01)", async () => {
    const { borrowerA, borrowerB, item } = await createFixtures();
    await createRequest(borrowerA.id, item.id, RequestStatus.Approved);
    await expect(createRequest(borrowerB.id, item.id, RequestStatus.Approved)).rejects.toThrow();
  });

  it("keeps other requests pending while a hold exists (FR-13)", async () => {
    const { borrowerA, borrowerB, item } = await createFixtures();
    await createRequest(borrowerA.id, item.id, RequestStatus.Approved);
    await expect(
      createRequest(borrowerB.id, item.id, RequestStatus.Pending),
    ).resolves.toBeDefined();
  });

  it("rejects a borrower's duplicate pending request for an item", async () => {
    const { borrowerA, item } = await createFixtures();
    await createRequest(borrowerA.id, item.id, RequestStatus.Pending);
    await expect(createRequest(borrowerA.id, item.id, RequestStatus.Pending)).rejects.toThrow();
  });

  it("requires a reason on a rejected request (FR-11)", async () => {
    const { borrowerA, item } = await createFixtures();
    await expect(createRequest(borrowerA.id, item.id, RequestStatus.Rejected)).rejects.toThrow();
  });

  describe("loans", () => {
    async function createLoanFixtures() {
      const fixtures = await createFixtures();
      const first = await createRequest(
        fixtures.borrowerA.id,
        fixtures.item.id,
        RequestStatus.Fulfilled,
      );
      const second = await createRequest(
        fixtures.borrowerB.id,
        fixtures.item.id,
        RequestStatus.Fulfilled,
      );
      return { ...fixtures, first, second };
    }

    function loanData(
      requestId: string,
      borrowerId: string,
      itemId: string,
      checkedOutById: string,
    ) {
      return {
        requestId,
        borrowerId,
        itemId,
        checkedOutById,
        checkoutDate: CHECKOUT,
        agreedDueDate: DUE,
        checkoutCondition: "Good",
      };
    }

    it("allows only one active loan per item (INV-01)", async () => {
      const { first, second, borrowerA, borrowerB, staff, item } = await createLoanFixtures();
      await prisma.loan.create({ data: loanData(first.id, borrowerA.id, item.id, staff.id) });
      await expect(
        prisma.loan.create({ data: loanData(second.id, borrowerB.id, item.id, staff.id) }),
      ).rejects.toThrow();
    });

    it("allows a new active loan once the previous loan is closed", async () => {
      const { first, second, borrowerA, borrowerB, staff, item } = await createLoanFixtures();
      const loan = await prisma.loan.create({
        data: loanData(first.id, borrowerA.id, item.id, staff.id),
      });
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          status: LoanStatus.Closed,
          returnDate: DUE,
          returnCondition: "Good",
          returnedById: staff.id,
          returnedAt: new Date(),
        },
      });
      await expect(
        prisma.loan.create({ data: loanData(second.id, borrowerB.id, item.id, staff.id) }),
      ).resolves.toBeDefined();
    });

    it("creates at most one loan per request (NFR-03)", async () => {
      const { first, borrowerA, staff, item } = await createLoanFixtures();
      const data = loanData(first.id, borrowerA.id, item.id, staff.id);
      await prisma.loan.create({ data });
      await prisma.loan.updateMany({
        data: {
          status: LoanStatus.Closed,
          returnDate: DUE,
          returnCondition: "Good",
          returnedById: staff.id,
          returnedAt: new Date(),
        },
      });
      await expect(prisma.loan.create({ data })).rejects.toThrow();
    });

    it("rejects a due date before checkout (FR-16)", async () => {
      const { first, borrowerA, staff, item } = await createLoanFixtures();
      await expect(
        prisma.loan.create({
          data: {
            ...loanData(first.id, borrowerA.id, item.id, staff.id),
            agreedDueDate: new Date("2026-11-01"),
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects a return date before checkout (FR-20)", async () => {
      const { first, borrowerA, staff, item } = await createLoanFixtures();
      const loan = await prisma.loan.create({
        data: loanData(first.id, borrowerA.id, item.id, staff.id),
      });
      await expect(
        prisma.loan.update({
          where: { id: loan.id },
          data: {
            status: LoanStatus.Closed,
            returnDate: new Date("2026-11-01"),
            returnCondition: "Good",
            returnedById: staff.id,
            returnedAt: new Date(),
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects closing a loan without return details (FR-20)", async () => {
      const { first, borrowerA, staff, item } = await createLoanFixtures();
      const loan = await prisma.loan.create({
        data: loanData(first.id, borrowerA.id, item.id, staff.id),
      });
      await expect(
        prisma.loan.update({ where: { id: loan.id }, data: { status: LoanStatus.Closed } }),
      ).rejects.toThrow();
    });

    it("refuses to delete an item or user referenced by history (FR-06, INV-03)", async () => {
      const { first, borrowerA, staff, item } = await createLoanFixtures();
      await prisma.loan.create({ data: loanData(first.id, borrowerA.id, item.id, staff.id) });
      await expect(prisma.item.delete({ where: { id: item.id } })).rejects.toThrow();
      await expect(prisma.user.delete({ where: { id: borrowerA.id } })).rejects.toThrow();
    });
  });
});
