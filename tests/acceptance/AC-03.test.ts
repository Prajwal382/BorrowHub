import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as checkout } from "@/app/api/requests/[id]/checkout/route";
import DashboardPage from "@/app/dashboard/page";
import { GET as listLoans } from "@/app/api/loans/route";
import { ItemStatus, LoanStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { addDays, formatDateOnly, orgToday } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { dateString, getRequest, renderPage, routeParams, signIn } from "./support";

const noContext = undefined as never;

async function scenario() {
  const [borrower, other, staff, item] = await Promise.all([
    createUser("blake"),
    createUser("riley"),
    createUser("sam", Role.Staff),
    createTestItem("CAM-1", { name: "Canon Camera" }),
  ]);
  const pending = await createRequest(borrower.id, {
    itemId: item.id,
    intendedUse: "Class project",
    requestedReturnDate: addDays(orgToday(), 7),
  });
  return { borrower, other, staff, item, requestId: pending.id };
}

const checkoutBody = (extra = {}) => ({
  checkoutDate: dateString(0),
  agreedDueDate: dateString(5),
  checkoutCondition: "No damage",
  ...extra,
});

describe("AC-03: staff check out a held item to its named borrower", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("AC-03: one Active loan exists, the item is Checked out, and the due date appears on the borrower dashboard", async () => {
    const { borrower, other, staff, item, requestId } = await scenario();
    await approveRequest(staff.id, requestId);
    const [borrowerSession, otherSession, staffSession] = await Promise.all(
      [borrower, other, staff].map(signIn),
    );

    // FR-15: a borrower named in the submission is ignored in favor of the one on the hold.
    const response = await staffSession(() =>
      checkout(jsonRequest("POST", checkoutBody({ borrowerId: other.id })), routeParams(requestId)),
    );

    expect(response.status).toBe(201);
    const loans = await prisma.loan.findMany();
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({
      requestId,
      itemId: item.id,
      borrowerId: borrower.id,
      status: LoanStatus.Active,
      checkoutCondition: "No damage",
      checkedOutById: staff.id,
    });
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.CheckedOut,
    });
    // FR-17: the hold is released by becoming Fulfilled.
    await expect(
      prisma.request.findUniqueOrThrow({ where: { id: requestId } }),
    ).resolves.toMatchObject({ status: RequestStatus.Fulfilled });

    const due = `Due ${formatDateOnly(addDays(orgToday(), 5))}`;
    const dashboard = await borrowerSession(() => renderPage(DashboardPage()));
    expect(dashboard).toContain("My active loans (1)");
    expect(dashboard).toContain("Canon Camera");
    expect(dashboard).toContain(due);

    const { loans: ownLoans } = await (
      await borrowerSession(() => listLoans(getRequest("?status=Active"), noContext))
    ).json();
    expect(ownLoans).toHaveLength(1);

    // FR-04: another borrower's dashboard shows none of this.
    const otherDashboard = await otherSession(() => renderPage(DashboardPage()));
    expect(otherDashboard).toContain("My active loans (0)");
    expect(otherDashboard).not.toContain("Canon Camera");
  });

  it("AC-03: an item without an approved hold cannot be checked out (FR-15)", async () => {
    const { staff, item, requestId } = await scenario();
    const staffSession = await signIn(staff);

    const response = await staffSession(() =>
      checkout(jsonRequest("POST", checkoutBody()), routeParams(requestId)),
    );

    expect(response.status).toBe(409);
    await expect(prisma.loan.count()).resolves.toBe(0);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Available,
    });
    await expect(
      prisma.request.findUniqueOrThrow({ where: { id: requestId } }),
    ).resolves.toMatchObject({ status: RequestStatus.Pending });
  });

  it("AC-03: an agreed return date before checkout is refused and changes nothing (FR-16)", async () => {
    const { staff, item, requestId } = await scenario();
    await approveRequest(staff.id, requestId);
    const staffSession = await signIn(staff);

    const response = await staffSession(() =>
      checkout(
        jsonRequest("POST", checkoutBody({ agreedDueDate: dateString(-1) })),
        routeParams(requestId),
      ),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fields.agreedDueDate).toHaveLength(1);
    await expect(prisma.loan.count()).resolves.toBe(0);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Held,
    });
  });
});
