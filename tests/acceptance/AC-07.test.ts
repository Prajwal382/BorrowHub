import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as approve } from "@/app/api/requests/[id]/approve/route";
import { POST as cancelHold } from "@/app/api/requests/[id]/cancel-hold/route";
import { POST as checkout } from "@/app/api/requests/[id]/checkout/route";
import { POST as submitRequest } from "@/app/api/requests/route";
import RequestsPage from "@/app/requests/page";
import { AuditAction, ItemStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { addDays, orgToday } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { checkoutRequest } from "@/lib/services/loanService";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { dateString, emptyRequest, pageProps, renderPage, routeParams, signIn } from "./support";

const noContext = undefined as never;

const checkoutBody = () =>
  jsonRequest("POST", {
    checkoutDate: dateString(0),
    agreedDueDate: dateString(5),
    checkoutCondition: "No damage",
  });

async function scenario() {
  const [borrower, other, staff, item] = await Promise.all([
    createUser("blake"),
    createUser("riley"),
    createUser("sam", Role.Staff),
    createTestItem("CAM-1", { name: "Canon Camera" }),
  ]);
  const newRequest = (borrowerId: string) =>
    createRequest(borrowerId, {
      itemId: item.id,
      intendedUse: "Class project",
      requestedReturnDate: addDays(orgToday(), 7),
    });
  const held = await newRequest(borrower.id);
  // FR-13: this one waits behind the hold.
  const waiting = await newRequest(other.id);
  await approveRequest(staff.id, held.id);
  return { borrower, other, staff, item, holdId: held.id, waitingId: waiting.id };
}

describe("AC-07: staff cancel an uncollected hold", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("AC-07: the request becomes Cancelled and the item becomes Available", async () => {
    const { borrower, staff, item, holdId, waitingId } = await scenario();
    const [borrowerSession, staffSession] = await Promise.all([borrower, staff].map(signIn));

    const response = await staffSession(() => cancelHold(emptyRequest(), routeParams(holdId)));

    expect(response.status).toBe(200);
    await expect(
      prisma.request.findUniqueOrThrow({ where: { id: holdId } }),
    ).resolves.toMatchObject({ status: RequestStatus.Cancelled, cancelledById: staff.id });
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Available,
    });
    await expect(prisma.loan.count()).resolves.toBe(0);

    // FR-14, NFR-06: the action is recorded against the person who took it.
    await expect(
      prisma.auditLog.findMany({ where: { action: AuditAction.HoldCancelled, entityId: holdId } }),
    ).resolves.toEqual([expect.objectContaining({ actorId: staff.id })]);

    // The borrower can see what happened.
    const page = await borrowerSession(() => renderPage(RequestsPage(pageProps())));
    expect(page).toContain("Canon Camera");
    expect(page).toContain("Hold cancelled");

    // The item really is free: a new request is accepted, and the waiting one can be approved.
    const fresh = await borrowerSession(() =>
      submitRequest(
        jsonRequest("POST", {
          itemId: item.id,
          intendedUse: "Second try",
          requestedReturnDate: dateString(7),
        }),
        noContext,
      ),
    );
    expect(fresh.status).toBe(201);
    const approval = await staffSession(() => approve(emptyRequest(), routeParams(waitingId)));
    expect(approval.status).toBe(200);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Held,
    });
  });

  it("AC-07: a cancelled hold cannot be checked out or cancelled again", async () => {
    const { staff, item, holdId } = await scenario();
    const staffSession = await signIn(staff);
    await staffSession(() => cancelHold(emptyRequest(), routeParams(holdId)));

    const secondCancel = await staffSession(() => cancelHold(emptyRequest(), routeParams(holdId)));
    const lateCheckout = await staffSession(() => checkout(checkoutBody(), routeParams(holdId)));

    expect(secondCancel.status).toBe(409);
    expect(lateCheckout.status).toBe(409);
    await expect(prisma.loan.count()).resolves.toBe(0);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Available,
    });
    await expect(
      prisma.auditLog.count({ where: { action: AuditAction.HoldCancelled } }),
    ).resolves.toBe(1);
  });

  it("AC-07: a hold that has been collected cannot be cancelled", async () => {
    const { staff, item, holdId } = await scenario();
    await checkoutRequest(staff.id, holdId, {
      checkoutDate: orgToday(),
      agreedDueDate: addDays(orgToday(), 5),
      checkoutCondition: "No damage",
    });
    const staffSession = await signIn(staff);

    const response = await staffSession(() => cancelHold(emptyRequest(), routeParams(holdId)));

    expect(response.status).toBe(409);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.CheckedOut,
    });
    await expect(
      prisma.request.findUniqueOrThrow({ where: { id: holdId } }),
    ).resolves.toMatchObject({ status: RequestStatus.Fulfilled });
  });
});
