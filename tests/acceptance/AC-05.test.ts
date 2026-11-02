import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as clearItem } from "@/app/api/items/[id]/clear/route";
import { POST as recordReturn } from "@/app/api/loans/[id]/return/route";
import { GET as listLoans } from "@/app/api/loans/route";
import { POST as submitRequest } from "@/app/api/requests/route";
import ItemPage from "@/app/catalog/[id]/page";
import HistoryPage from "@/app/history/page";
import StaffHistoryPage from "@/app/staff/history/page";
import { AuditAction, ItemStatus, LoanStatus, Role } from "@/generated/prisma/client";
import { addDays, formatDateOnly, orgToday } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { checkoutRequest } from "@/lib/services/loanService";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { dateString, getRequest, pageProps, renderPage, routeParams, signIn } from "./support";

const noContext = undefined as never;

const returnNeedingAttention = () =>
  jsonRequest("POST", {
    returnDate: dateString(0),
    returnCondition: "Cracked lens",
    returnConditionNotes: "Dropped during the shoot",
    itemOutcome: ItemStatus.Unavailable,
  });

const newRequest = (itemId: string) =>
  jsonRequest("POST", {
    itemId,
    intendedUse: "Another project",
    requestedReturnDate: dateString(7),
  });

async function scenario() {
  const [borrower, other, staff, item] = await Promise.all([
    createUser("blake"),
    createUser("riley"),
    createUser("sam", Role.Staff),
    createTestItem("CAM-1", { name: "Canon Camera" }),
  ]);
  const { id } = await createRequest(borrower.id, {
    itemId: item.id,
    intendedUse: "Class project",
    requestedReturnDate: addDays(orgToday(), 7),
  });
  await approveRequest(staff.id, id);
  const loan = await checkoutRequest(staff.id, id, {
    checkoutDate: orgToday(),
    agreedDueDate: addDays(orgToday(), 7),
    checkoutCondition: "No damage",
  });
  const [borrowerSession, otherSession, staffSession] = await Promise.all(
    [borrower, other, staff].map(signIn),
  );
  return { borrower, staff, item, loanId: loan.id, borrowerSession, otherSession, staffSession };
}

describe("AC-05: staff close a loan and mark the item as needing attention", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("AC-05: history retains the loan, and the item is Unavailable and cannot be requested", async () => {
    const { borrower, staff, item, loanId, borrowerSession, otherSession, staffSession } =
      await scenario();

    const response = await staffSession(() =>
      recordReturn(returnNeedingAttention(), routeParams(loanId)),
    );
    expect(response.status).toBe(200);

    // FR-22: everything history promises is kept on the closed loan.
    const closed = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    expect(closed).toMatchObject({
      itemId: item.id,
      borrowerId: borrower.id,
      status: LoanStatus.Closed,
      checkoutCondition: "No damage",
      returnCondition: "Cracked lens",
      returnConditionNotes: "Dropped during the shoot",
      returnedById: staff.id,
    });
    expect(closed.returnDate).toEqual(orgToday());
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Unavailable,
    });

    const staffHistory = await staffSession(() => renderPage(StaffHistoryPage(pageProps())));
    const borrowerHistory = await borrowerSession(() => renderPage(HistoryPage(pageProps())));
    for (const history of [staffHistory, borrowerHistory]) {
      expect(history).toContain("Canon Camera");
      expect(history).toContain("CAM-1");
      expect(history).toContain("No damage");
      expect(history).toContain("Cracked lens");
      expect(history).toContain(formatDateOnly(orgToday()));
      expect(history).toContain(formatDateOnly(addDays(orgToday(), 7)));
    }
    expect(staffHistory).toContain("blake@test.local");

    // FR-23: another borrower's history shows none of it.
    const { total } = await (
      await otherSession(() => listLoans(getRequest("?status=Closed"), noContext))
    ).json();
    expect(total).toBe(0);

    const refused = await otherSession(() => submitRequest(newRequest(item.id), noContext));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.message).toContain("not available");
    await expect(prisma.request.count({ where: { itemId: item.id } })).resolves.toBe(1);

    const itemPage = await otherSession(() => renderPage(ItemPage(pageProps({ id: item.id }))));
    expect(itemPage).toContain("Unavailable");
    expect(itemPage).toContain("This item cannot be requested right now.");
    expect(itemPage).not.toContain("Submit request");
  });

  it("AC-05: the item can be requested again only after staff clear it (FR-21)", async () => {
    const { staff, item, loanId, otherSession, staffSession } = await scenario();
    await staffSession(() => recordReturn(returnNeedingAttention(), routeParams(loanId)));

    // A borrower cannot clear an item for themselves.
    const denied = await otherSession(() =>
      clearItem(jsonRequest("POST", {}), routeParams(item.id)),
    );
    expect(denied.status).toBe(403);
    expect((await otherSession(() => submitRequest(newRequest(item.id), noContext))).status).toBe(
      409,
    );

    const cleared = await staffSession(() =>
      clearItem(jsonRequest("POST", { conditionNotes: "Lens replaced" }), routeParams(item.id)),
    );
    expect(cleared.status).toBe(200);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Available,
      conditionNotes: "Lens replaced",
    });
    await expect(
      prisma.auditLog.findMany({ where: { action: AuditAction.ItemCleared, entityId: item.id } }),
    ).resolves.toEqual([expect.objectContaining({ actorId: staff.id })]);

    expect((await otherSession(() => submitRequest(newRequest(item.id), noContext))).status).toBe(
      201,
    );

    // The closed loan is unaffected by the item being lent again.
    await expect(prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).resolves.toMatchObject({
      status: LoanStatus.Closed,
      returnCondition: "Cracked lens",
    });
  });
});
