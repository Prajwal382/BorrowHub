import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as recordReturn } from "@/app/api/loans/[id]/return/route";
import { GET as listLoans } from "@/app/api/loans/route";
import DashboardPage from "@/app/dashboard/page";
import StaffLoansPage from "@/app/staff/loans/page";
import { ItemStatus, LoanStatus, Role } from "@/generated/prisma/client";
import { addDays, orgToday, parseDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { checkoutRequest } from "@/lib/services/loanService";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { getRequest, pageProps, renderPage, routeParams, signIn } from "./support";

const noContext = undefined as never;

// Chicago is UTC-6 in December, so its date changes at 06:00 UTC, after the UTC date has changed.
const CHECKOUT_DAY = new Date("2026-12-01T18:00:00Z");
const LAST_MINUTE_OF_DUE_DATE = new Date("2026-12-05T05:59:00Z");
const FIRST_MINUTE_AFTER_DUE_DATE = new Date("2026-12-05T06:00:00Z");

async function activeLoan() {
  const [borrower, staff, item] = await Promise.all([
    createUser("blake"),
    createUser("sam", Role.Staff),
    createTestItem("CAM-1", { name: "Canon Camera" }),
  ]);
  const { id } = await createRequest(borrower.id, {
    itemId: item.id,
    intendedUse: "Class project",
    requestedReturnDate: addDays(orgToday(), 3),
  });
  await approveRequest(staff.id, id);
  const loan = await checkoutRequest(staff.id, id, {
    checkoutDate: orgToday(),
    agreedDueDate: parseDateOnly("2026-12-04")!,
    checkoutCondition: "No damage",
  });
  return { borrower, staff, item, loanId: loan.id };
}

describe("AC-04: the local date passes the agreed return date of an Active loan", () => {
  beforeEach(async () => {
    await resetDatabase();
    // Only the clock is faked. Database timers keep running normally.
    vi.useFakeTimers({ toFake: ["Date"], now: CHECKOUT_DAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => prisma.$disconnect());

  it("AC-04: the loan appears in the staff overdue list", async () => {
    const { staff, loanId } = await activeLoan();

    async function staffOverdueList() {
      // Sessions last 12 hours, so staff sign in again after the clock jumps by days.
      const session = await signIn(staff);
      const { loans, total } = await (
        await session(() => listLoans(getRequest("?overdue=true"), noContext))
      ).json();
      const page = await session(() =>
        renderPage(StaffLoansPage(pageProps({}, { overdue: "true" }))),
      );
      const dashboard = await session(() => renderPage(DashboardPage()));
      return { loans, total, page, dashboard };
    }

    const onCheckoutDay = await staffOverdueList();
    expect(onCheckoutDay.total).toBe(0);
    expect(onCheckoutDay.page).toContain("0 overdue loans");
    expect(onCheckoutDay.dashboard).toContain("Overdue loans (0)");

    // The UTC date has already moved on here, but the organization's has not (FR-19).
    vi.setSystemTime(LAST_MINUTE_OF_DUE_DATE);
    const onDueDate = await staffOverdueList();
    expect(onDueDate.total).toBe(0);
    expect(onDueDate.page).not.toContain("Canon Camera");

    vi.setSystemTime(FIRST_MINUTE_AFTER_DUE_DATE);
    const afterDueDate = await staffOverdueList();
    expect(afterDueDate.total).toBe(1);
    expect(afterDueDate.loans[0]).toMatchObject({ id: loanId, overdue: true });
    expect(afterDueDate.page).toContain("1 overdue loan");
    expect(afterDueDate.page).toContain("Canon Camera");
    expect(afterDueDate.page).toContain("Overdue");
    expect(afterDueDate.dashboard).toContain("Overdue loans (1)");

    // Section 4: Overdue is derived, so the stored loan is still simply Active.
    await expect(prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).resolves.toMatchObject({
      status: LoanStatus.Active,
    });
  });

  it("AC-04: the loan leaves the overdue list once it is returned", async () => {
    const { staff, loanId, item } = await activeLoan();
    vi.setSystemTime(FIRST_MINUTE_AFTER_DUE_DATE);
    const session = await signIn(staff);

    const response = await session(() =>
      recordReturn(
        jsonRequest("POST", {
          returnDate: "2026-12-05",
          returnCondition: "Good",
          itemOutcome: ItemStatus.Available,
        }),
        routeParams(loanId),
      ),
    );

    expect(response.status).toBe(200);
    const { total } = await (
      await session(() => listLoans(getRequest("?overdue=true"), noContext))
    ).json();
    expect(total).toBe(0);
    await expect(prisma.item.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({
      status: ItemStatus.Available,
    });
  });
});
