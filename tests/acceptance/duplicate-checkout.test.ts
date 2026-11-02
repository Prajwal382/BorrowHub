import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as checkout } from "@/app/api/requests/[id]/checkout/route";
import {
  AuditAction,
  ItemStatus,
  LoanStatus,
  RequestStatus,
  Role,
} from "@/generated/prisma/client";
import { addDays, orgToday } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { dateString, routeParams, signIn, type Session } from "./support";

const ROUNDS = 15;

const submitCheckout = (staff: Session, requestId: string) =>
  staff(() =>
    checkout(
      jsonRequest("POST", {
        checkoutDate: dateString(0),
        agreedDueDate: dateString(5),
        checkoutCondition: "No damage",
      }),
      routeParams(requestId),
    ),
  );

async function people() {
  const [borrower, sam, alex] = await Promise.all([
    createUser("blake"),
    createUser("sam", Role.Staff),
    createUser("alex", Role.Staff),
  ]);
  const staff = await Promise.all([signIn(sam), signIn(alex)]);
  return { borrower, sam, staff };
}

async function heldItem(code: string, borrowerId: string, staffId: string) {
  const item = await createTestItem(code);
  const { id } = await createRequest(borrowerId, {
    itemId: item.id,
    intendedUse: "Class project",
    requestedReturnDate: addDays(orgToday(), 7),
  });
  await approveRequest(staffId, id);
  return { itemId: item.id, requestId: id };
}

// NFR-03, INV-01: one loan, and every trace of the checkout agrees.
async function expectOneLoan(itemId: string, requestId: string) {
  await expect(prisma.loan.findMany({ where: { itemId } })).resolves.toEqual([
    expect.objectContaining({ requestId, status: LoanStatus.Active }),
  ]);
  await expect(prisma.item.findUniqueOrThrow({ where: { id: itemId } })).resolves.toMatchObject({
    status: ItemStatus.CheckedOut,
  });
  await expect(
    prisma.request.findUniqueOrThrow({ where: { id: requestId } }),
  ).resolves.toMatchObject({ status: RequestStatus.Fulfilled });

  const loan = await prisma.loan.findFirstOrThrow({ where: { itemId } });
  await expect(
    prisma.auditLog.count({ where: { action: AuditAction.ItemCheckedOut, entityId: loan.id } }),
  ).resolves.toBe(1);
}

describe("duplicate checkout (NFR-03, INV-01)", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("creates one loan when the same checkout is submitted twice in a row", async () => {
    const { borrower, sam, staff } = await people();
    const { itemId, requestId } = await heldItem("CAM-1", borrower.id, sam.id);

    const first = await submitCheckout(staff[0], requestId);
    const second = await submitCheckout(staff[0], requestId);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect((await second.json()).error.message).toContain("Only an item on hold");
    await expectOneLoan(itemId, requestId);
  });

  it("creates one loan when two staff submit the same checkout at the same time", async () => {
    const { borrower, sam, staff } = await people();

    for (let round = 0; round < ROUNDS; round++) {
      const { itemId, requestId } = await heldItem(`CAM-${round}`, borrower.id, sam.id);

      const responses = await Promise.all([
        submitCheckout(staff[0], requestId),
        submitCheckout(staff[1], requestId),
      ]);

      expect(responses.map((response) => response.status).toSorted()).toEqual([201, 409]);
      await expectOneLoan(itemId, requestId);
    }
  });

  it("creates one loan when a double-clicking browser submits many at the same time", async () => {
    const { borrower, sam, staff } = await people();

    for (let round = 0; round < 5; round++) {
      const { itemId, requestId } = await heldItem(`CAM-${round}`, borrower.id, sam.id);

      const responses = await Promise.all(
        Array.from({ length: 8 }, () => submitCheckout(staff[0], requestId)),
      );

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(7);
      await expectOneLoan(itemId, requestId);
    }
  });
});
