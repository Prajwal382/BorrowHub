import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as approve } from "@/app/api/requests/[id]/approve/route";
import { POST as submitRequest } from "@/app/api/requests/route";
import { AuditAction, ItemStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { dateString, emptyRequest, routeParams, signIn, type Session } from "./support";

const noContext = undefined as never;
// A race can go either way or barely overlap on any one attempt, so each one runs repeatedly.
const ROUNDS = 15;

const approveAs = (staff: Session, id: string) =>
  staff(() => approve(emptyRequest(), routeParams(id)));

async function request(borrower: Session, itemId: string) {
  const response = await borrower(() =>
    submitRequest(
      jsonRequest("POST", {
        itemId,
        intendedUse: "Class project",
        requestedReturnDate: dateString(7),
      }),
      noContext,
    ),
  );
  expect(response.status).toBe(201);
  return (await response.json()).request.id as string;
}

async function people() {
  const [blake, riley, sam, alex] = await Promise.all([
    createUser("blake"),
    createUser("riley"),
    createUser("sam", Role.Staff),
    createUser("alex", Role.Staff),
  ]);
  const [firstBorrower, secondBorrower, firstStaff, secondStaff] = await Promise.all(
    [blake, riley, sam, alex].map(signIn),
  );
  return { firstBorrower, secondBorrower, firstStaff, secondStaff, sam, alex };
}

// INV-01, NFR-03: exactly one hold, and every trace of it agrees.
async function expectOneHold(itemId: string, winningRequestId: string, winnerId: string) {
  await expect(prisma.item.findUniqueOrThrow({ where: { id: itemId } })).resolves.toMatchObject({
    status: ItemStatus.Held,
  });

  const approved = await prisma.request.findMany({
    where: { itemId, status: RequestStatus.Approved },
  });
  expect(approved).toHaveLength(1);
  expect(approved[0]).toMatchObject({ id: winningRequestId, decidedById: winnerId });

  const audits = await prisma.auditLog.findMany({
    where: { action: AuditAction.RequestApproved, entityId: winningRequestId },
  });
  expect(audits).toHaveLength(1);
  expect(audits[0].actorId).toBe(winnerId);
}

describe("AC-02: two staff attempt approval for the same item", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("AC-02: when two staff approve two requests for one item at once, one creates the hold and the other fails", async () => {
    const { firstBorrower, secondBorrower, firstStaff, secondStaff, sam, alex } = await people();
    const winners = new Set<string>();

    for (let round = 0; round < ROUNDS; round++) {
      const item = await createTestItem(`CAM-${round}`);
      const requests = [
        await request(firstBorrower, item.id),
        await request(secondBorrower, item.id),
      ];

      const responses = await Promise.all([
        approveAs(firstStaff, requests[0]),
        approveAs(secondStaff, requests[1]),
      ]);

      expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409]);
      const winner = responses[0].status === 200 ? 0 : 1;
      winners.add(requests[winner]);
      await expectOneHold(item.id, requests[winner], winner === 0 ? sam.id : alex.id);

      // NFR-02, FR-13: the loser hears why, and its request is left pending rather than changed.
      const { error } = await responses[1 - winner].json();
      expect(error.code).toBe("CONFLICT");
      expect(error.message).not.toMatch(/prisma|constraint|unique|P20/i);
      const loser = await prisma.request.findUniqueOrThrow({
        where: { id: requests[1 - winner] },
      });
      expect(loser).toMatchObject({
        status: RequestStatus.Pending,
        decidedById: null,
        decidedAt: null,
      });
      await expect(
        prisma.auditLog.count({ where: { entityId: requests[1 - winner] } }),
      ).resolves.toBe(0);
    }
    expect(winners.size).toBe(ROUNDS);
  });

  it("AC-02: when two staff approve the same request at once, one creates the hold and the other fails", async () => {
    const { firstBorrower, firstStaff, secondStaff, sam, alex } = await people();

    for (let round = 0; round < ROUNDS; round++) {
      const item = await createTestItem(`CAM-${round}`);
      const id = await request(firstBorrower, item.id);

      const responses = await Promise.all([approveAs(firstStaff, id), approveAs(secondStaff, id)]);

      expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409]);
      await expectOneHold(item.id, id, responses[0].status === 200 ? sam.id : alex.id);
    }
  });

  it("AC-02: when many approvals for one item race, exactly one succeeds", async () => {
    const people = await Promise.all(
      Array.from({ length: 8 }, (_, index) => createUser(`borrower-${index}`)),
    );
    const borrowers = await Promise.all(people.map(signIn));
    const [samUser, alexUser] = await Promise.all([
      createUser("sam", Role.Staff),
      createUser("alex", Role.Staff),
    ]);
    const staff = await Promise.all([signIn(samUser), signIn(alexUser)]);

    for (let round = 0; round < 5; round++) {
      const item = await createTestItem(`CAM-${round}`);
      const requests = await Promise.all(borrowers.map((borrower) => request(borrower, item.id)));

      const responses = await Promise.all(
        requests.map((id, index) => approveAs(staff[index % 2], id)),
      );

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(requests.length - 1);
      await expect(
        prisma.request.count({ where: { itemId: item.id, status: RequestStatus.Approved } }),
      ).resolves.toBe(1);
      await expect(
        prisma.request.count({ where: { itemId: item.id, status: RequestStatus.Pending } }),
      ).resolves.toBe(requests.length - 1);
      await expect(
        prisma.item.findUniqueOrThrow({ where: { id: item.id } }),
      ).resolves.toMatchObject({ status: ItemStatus.Held });
    }
  });

  it("AC-02: a later approval for an item already on hold fails and stays pending (FR-13)", async () => {
    const { firstBorrower, secondBorrower, firstStaff, secondStaff } = await people();
    const item = await createTestItem("CAM-1");
    const first = await request(firstBorrower, item.id);
    const second = await request(secondBorrower, item.id);

    expect((await approveAs(firstStaff, first)).status).toBe(200);
    const late = await approveAs(secondStaff, second);

    expect(late.status).toBe(409);
    expect((await late.json()).error.message).toContain("stays pending");
    await expect(
      prisma.request.findUniqueOrThrow({ where: { id: second } }),
    ).resolves.toMatchObject({ status: RequestStatus.Pending });
  });
});
