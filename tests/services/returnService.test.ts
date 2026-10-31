import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AuditAction,
  ItemStatus,
  LoanStatus,
  RequestStatus,
  Role,
} from "@/generated/prisma/client";
import { addDays, orgToday } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { clearItem, getItem, updateItem } from "@/lib/services/itemService";
import { checkoutRequest, getLoan, listLoans, returnLoan } from "@/lib/services/loanService";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { clearItemSchema } from "@/lib/validation/items";
import { loanQuerySchema, returnSchema } from "@/lib/validation/loans";
import { createTestItem, createUser, resetDatabase, withFailingAuditLog } from "../helpers";

const inDays = (days: number) => addDays(orgToday(), days);
const query = (input: Record<string, unknown> = {}) => loanQuerySchema.parse(input);

function returnInput(overrides: Partial<Parameters<typeof returnLoan>[2]> = {}) {
  return {
    returnDate: orgToday(),
    returnCondition: "Good",
    itemOutcome: ItemStatus.Available,
    ...overrides,
  } as Parameters<typeof returnLoan>[2];
}

async function borrowFlow(
  staffId: string,
  borrowerId: string,
  itemId: string,
  { checkoutDate = orgToday() } = {},
) {
  const { id } = await createRequest(borrowerId, {
    itemId,
    intendedUse: "Class project",
    requestedReturnDate: inDays(7),
  });
  await approveRequest(staffId, id);
  const loan = await checkoutRequest(staffId, id, {
    checkoutDate,
    agreedDueDate: inDays(7),
    checkoutCondition: "Good at checkout",
  });
  return { requestId: id, loanId: loan.id };
}

async function fixtures() {
  const [staff, borrower, other, item] = await Promise.all([
    createUser("staff", Role.Staff),
    createUser("borrower"),
    createUser("other"),
    createTestItem("CAM-1", { conditionNotes: "Original notes" }),
  ]);
  return { staff, borrower, other, item };
}

async function item(id: string) {
  return prisma.item.findUniqueOrThrow({ where: { id } });
}

// INV-01, INV-02: what must hold after any sequence of operations.
async function assertInvariants() {
  const items = await prisma.item.findMany({
    include: {
      requests: { where: { status: RequestStatus.Approved } },
      loans: { where: { status: LoanStatus.Active } },
    },
  });
  for (const { status, requests, loans } of items) {
    expect(requests.length).toBeLessThanOrEqual(1);
    expect(loans.length).toBeLessThanOrEqual(1);
    expect(requests.length + loans.length).toBeLessThanOrEqual(1);
    expect(requests.length === 1).toBe(status === ItemStatus.Held);
    expect(loans.length === 1).toBe(status === ItemStatus.CheckedOut);
  }
}

describe("returns", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  describe("returnLoan (FR-20, FR-21)", () => {
    it("closes the loan, records the details, and frees an acceptable item", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

      const returned = await returnLoan(
        staff.id,
        loanId,
        returnInput({ returnCondition: "Fine", returnConditionNotes: "Slight wear" }),
      );

      expect(returned).toMatchObject({
        status: LoanStatus.Closed,
        returnCondition: "Fine",
        returnConditionNotes: "Slight wear",
        overdue: false,
      });
      expect(returned.returnDate).toEqual(orgToday());
      expect(returned.returnedBy?.name).toBe("staff");
      expect(returned.returnedAt).toBeInstanceOf(Date);
      expect((await item(camera.id)).status).toBe(ItemStatus.Available);
    });

    it("marks an item needing attention Unavailable and keeps the loan (AC-05)", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

      await returnLoan(
        staff.id,
        loanId,
        returnInput({ returnCondition: "Cracked lens", itemOutcome: ItemStatus.Unavailable }),
      );

      expect((await item(camera.id)).status).toBe(ItemStatus.Unavailable);
      const { loans } = await listLoans(staff, query({ status: LoanStatus.Closed }));
      expect(loans.map((loan) => loan.id)).toEqual([loanId]);
      await expect(
        createRequest(borrower.id, {
          itemId: camera.id,
          intendedUse: "Again",
          requestedReturnDate: inDays(3),
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("audits the return with the acting user (NFR-06)", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

      await returnLoan(staff.id, loanId, returnInput({ itemOutcome: ItemStatus.Unavailable }));

      const log = await prisma.auditLog.findFirst({ where: { action: AuditAction.ItemReturned } });
      expect(log).toMatchObject({ actorId: staff.id, entityType: "Loan", entityId: loanId });
      expect(log?.details).toMatchObject({ itemOutcome: ItemStatus.Unavailable });
      expect(log?.createdAt).toBeInstanceOf(Date);
    });

    it("makes the inspection the item's current condition (FR-05)", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const first = await borrowFlow(staff.id, borrower.id, camera.id);

      await returnLoan(
        staff.id,
        first.loanId,
        returnInput({ returnCondition: "Scratched", returnConditionNotes: "Scratch on screen" }),
      );
      expect((await item(camera.id)).conditionNotes).toBe("Scratch on screen");

      const second = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, second.loanId, returnInput({ returnCondition: "Good" }));
      expect((await item(camera.id)).conditionNotes).toBe("Good");
    });

    it("keeps the earlier condition on the loan as history (FR-22)", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const first = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, first.loanId, returnInput({ returnCondition: "First" }));
      const second = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, second.loanId, returnInput({ returnCondition: "Second" }));

      expect((await getLoan(first.loanId, staff)).returnCondition).toBe("First");
    });

    it("stores blank notes as none", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

      const returned = await returnLoan(
        staff.id,
        loanId,
        returnInput({ returnConditionNotes: "" }),
      );

      expect(returned.returnConditionNotes).toBeNull();
    });

    it("lets a returned item be held and lent again (SRS section 4)", async () => {
      const { staff, borrower, other, item: camera } = await fixtures();
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, loanId, returnInput());

      const next = await borrowFlow(staff.id, other.id, camera.id);

      expect((await getLoan(next.loanId, staff)).borrowerId).toBe(other.id);
      await assertInvariants();
    });

    it("lets a request left pending during the loan be approved afterwards (FR-13)", async () => {
      const { staff, borrower, other, item: camera } = await fixtures();
      const waiting = await createRequest(other.id, {
        itemId: camera.id,
        intendedUse: "Waiting",
        requestedReturnDate: inDays(9),
      });
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, loanId, returnInput());

      await expect(approveRequest(staff.id, waiting.id)).resolves.toMatchObject({
        status: RequestStatus.Approved,
      });
    });

    it("keeps a request pending while the item is unavailable, until cleared (FR-21)", async () => {
      const { staff, borrower, other, item: camera } = await fixtures();
      const waiting = await createRequest(other.id, {
        itemId: camera.id,
        intendedUse: "Waiting",
        requestedReturnDate: inDays(9),
      });
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, loanId, returnInput({ itemOutcome: ItemStatus.Unavailable }));

      await expect(approveRequest(staff.id, waiting.id)).rejects.toBeInstanceOf(ConflictError);

      await clearItem(staff.id, camera.id, {});
      await expect(approveRequest(staff.id, waiting.id)).resolves.toBeDefined();
    });

    it("reports a loan that does not exist", async () => {
      const { staff } = await fixtures();
      await expect(returnLoan(staff.id, "missing", returnInput())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    describe("dates (FR-20, NFR-02)", () => {
      it("allows a return on the checkout date", async () => {
        const { staff, borrower, item: camera } = await fixtures();
        const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

        await expect(
          returnLoan(staff.id, loanId, returnInput({ returnDate: orgToday() })),
        ).resolves.toBeDefined();
      });

      it("rejects a return before checkout, changing nothing", async () => {
        const { staff, borrower, item: camera } = await fixtures();
        const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

        const error = await returnLoan(
          staff.id,
          loanId,
          returnInput({ returnDate: inDays(-1) }),
        ).catch((caught) => caught);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.returnDate).toEqual([
          "The return date cannot be before the checkout date.",
        ]);
        await expect(getLoan(loanId, staff)).resolves.toMatchObject({ status: LoanStatus.Active });
        expect((await item(camera.id)).status).toBe(ItemStatus.CheckedOut);
      });

      it("rejects a return date in the future", async () => {
        const { staff, borrower, item: camera } = await fixtures();
        const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

        const error = await returnLoan(
          staff.id,
          loanId,
          returnInput({ returnDate: inDays(1) }),
        ).catch((caught) => caught);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.returnDate).toEqual(["The return date cannot be in the future."]);
      });
    });

    describe("validation (NFR-02)", () => {
      const valid = {
        returnDate: "2026-11-09",
        returnCondition: "Good",
        itemOutcome: ItemStatus.Available,
      };

      it("requires staff to choose an outcome, with no default (FR-21)", () => {
        const result = returnSchema.safeParse({ ...valid, itemOutcome: undefined });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("Choose whether this item can be lent again.");
      });

      it.each([ItemStatus.Held, ItemStatus.CheckedOut, "Lost"])(
        "refuses the outcome %s (INV-02)",
        (itemOutcome) => {
          expect(returnSchema.safeParse({ ...valid, itemOutcome }).success).toBe(false);
        },
      );

      it.each(["", "   "])("requires an inspected condition, refusing %j", (returnCondition) => {
        expect(returnSchema.safeParse({ ...valid, returnCondition }).success).toBe(false);
      });

      it("does not require notes", () => {
        expect(returnSchema.safeParse(valid).success).toBe(true);
      });
    });

    describe("atomicity and repeats (NFR-03)", () => {
      it("rolls everything back if the audit row cannot be written", async () => {
        const { staff, borrower, item: camera } = await fixtures();
        const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);

        await withFailingAuditLog(async () => {
          await expect(returnLoan(staff.id, loanId, returnInput())).rejects.toThrow(
            "audit log unavailable",
          );
        });

        const loan = await getLoan(loanId, staff);
        expect(loan.status).toBe(LoanStatus.Active);
        expect(loan.returnDate).toBeNull();
        const stored = await item(camera.id);
        expect(stored.status).toBe(ItemStatus.CheckedOut);
        expect(stored.conditionNotes).toBe("Original notes");
      });

      it("refuses a second return", async () => {
        const { staff, borrower, item: camera } = await fixtures();
        const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
        await returnLoan(
          staff.id,
          loanId,
          returnInput({ returnCondition: "First", itemOutcome: ItemStatus.Unavailable }),
        );

        await expect(
          returnLoan(staff.id, loanId, returnInput({ returnCondition: "Second" })),
        ).rejects.toBeInstanceOf(ConflictError);

        // The second attempt must not overwrite the record or free the item.
        expect((await getLoan(loanId, staff)).returnCondition).toBe("First");
        expect((await item(camera.id)).status).toBe(ItemStatus.Unavailable);
      });

      it("cannot free an item lent to someone else by repeating an old return (INV-02)", async () => {
        const { staff, borrower, other, item: camera } = await fixtures();
        const old = await borrowFlow(staff.id, borrower.id, camera.id);
        await returnLoan(staff.id, old.loanId, returnInput({ returnCondition: "First" }));
        const current = await borrowFlow(staff.id, other.id, camera.id);

        await expect(
          returnLoan(staff.id, old.loanId, returnInput({ returnCondition: "Stale" })),
        ).rejects.toBeInstanceOf(ConflictError);

        // The item is still out with the current borrower, and the old record is untouched.
        expect((await item(camera.id)).status).toBe(ItemStatus.CheckedOut);
        expect((await getLoan(current.loanId, staff)).status).toBe(LoanStatus.Active);
        expect((await getLoan(old.loanId, staff)).returnCondition).toBe("First");
        await assertInvariants();
      });

      it("fails without any change if the item is not checked out", async () => {
        const { staff, borrower, item: camera } = await fixtures();
        const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
        await prisma.item.update({
          where: { id: camera.id },
          data: { status: ItemStatus.Unavailable, conditionNotes: "Flagged" },
        });

        await expect(returnLoan(staff.id, loanId, returnInput())).rejects.toBeInstanceOf(
          ConflictError,
        );

        expect((await getLoan(loanId, staff)).status).toBe(LoanStatus.Active);
        const stored = await item(camera.id);
        expect(stored.status).toBe(ItemStatus.Unavailable);
        expect(stored.conditionNotes).toBe("Flagged");
      });

      it("records one return when submitted repeatedly at once", async () => {
        const { staff, borrower, item: camera } = await fixtures();

        for (let attempt = 0; attempt < 10; attempt += 1) {
          await prisma.item.update({
            where: { id: camera.id },
            data: { status: ItemStatus.Available },
          });
          const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
          await prisma.auditLog.deleteMany();

          const results = await Promise.allSettled(
            [1, 2, 3].map(() => returnLoan(staff.id, loanId, returnInput())),
          );

          expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
          for (const result of results) {
            if (result.status === "rejected") {
              expect(result.reason).toBeInstanceOf(ConflictError);
            }
          }
          await expect(
            prisma.auditLog.count({ where: { action: AuditAction.ItemReturned } }),
          ).resolves.toBe(1);
          await assertInvariants();
        }
      });
    });
  });

  describe("clearItem (FR-21)", () => {
    it("returns an Unavailable item to Available and audits it (NFR-06)", async () => {
      const { staff } = await fixtures();
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });

      const cleared = await clearItem(staff.id, broken.id, { conditionNotes: "Repaired" });

      expect(cleared).toMatchObject({ status: ItemStatus.Available, conditionNotes: "Repaired" });
      await expect(
        prisma.auditLog.findFirst({ where: { action: AuditAction.ItemCleared } }),
      ).resolves.toMatchObject({ actorId: staff.id, entityType: "Item", entityId: broken.id });
    });

    it("keeps the notes when none are given", async () => {
      const { staff } = await fixtures();
      const broken = await createTestItem("CAM-2", {
        status: ItemStatus.Unavailable,
        conditionNotes: "Keep me",
      });

      const cleared = await clearItem(staff.id, broken.id, clearItemSchema.parse({}));

      expect(cleared.conditionNotes).toBe("Keep me");
    });

    it("makes the item requestable again", async () => {
      const { staff, borrower } = await fixtures();
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });
      const request = {
        itemId: broken.id,
        intendedUse: "Use",
        requestedReturnDate: inDays(3),
      };
      await expect(createRequest(borrower.id, request)).rejects.toBeInstanceOf(ConflictError);

      await clearItem(staff.id, broken.id, {});

      await expect(createRequest(borrower.id, request)).resolves.toBeDefined();
    });

    it("is the only way back: an item edit cannot do it", async () => {
      const { staff } = await fixtures();
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });

      await expect(
        updateItem(staff.id, broken.id, { status: ItemStatus.Available }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await getItem(broken.id, Role.Staff)).status).toBe(ItemStatus.Unavailable);
    });

    it.each([ItemStatus.Available, ItemStatus.Held, ItemStatus.CheckedOut])(
      "refuses a %s item (INV-02)",
      async (status) => {
        const { staff } = await fixtures();
        const target = await createTestItem("CAM-2", { status });

        await expect(clearItem(staff.id, target.id, {})).rejects.toBeInstanceOf(ConflictError);
        expect((await item(target.id)).status).toBe(status);
        await expect(prisma.auditLog.count()).resolves.toBe(0);
      },
    );

    it("reports an item that does not exist", async () => {
      const { staff } = await fixtures();
      await expect(clearItem(staff.id, "missing", {})).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rolls back if the audit row cannot be written (NFR-03)", async () => {
      const { staff } = await fixtures();
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });

      await withFailingAuditLog(async () => {
        await expect(clearItem(staff.id, broken.id, {})).rejects.toThrow("audit log unavailable");
      });

      expect((await item(broken.id)).status).toBe(ItemStatus.Unavailable);
    });

    it("clears once when two staff act at once", async () => {
      const { staff } = await fixtures();
      const other = await createUser("staff2", Role.Staff);
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });

      const results = await Promise.allSettled([
        clearItem(staff.id, broken.id, {}),
        clearItem(other.id, broken.id, {}),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      await expect(prisma.auditLog.count()).resolves.toBe(1);
    });
  });

  describe("history (FR-22, FR-23, INV-03)", () => {
    async function completedLoan(key: string, borrowerId: string, staffId: string) {
      const camera = await createTestItem(key, { name: `Name ${key}`, category: `Cat ${key}` });
      const { loanId } = await borrowFlow(staffId, borrowerId, camera.id);
      await returnLoan(staffId, loanId, returnInput({ returnCondition: `Back ${key}` }));
      return { loanId, itemId: camera.id };
    }

    it("preserves every required field (FR-22)", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      const { loanId } = await borrowFlow(staff.id, borrower.id, camera.id);
      await returnLoan(staff.id, loanId, returnInput({ returnCondition: "Fine" }));

      const { loans } = await listLoans(staff, query({ status: LoanStatus.Closed }));

      expect(loans[0]).toMatchObject({
        item: { id: camera.id, itemCode: "CAM-1" },
        borrower: { id: borrower.id, email: borrower.email },
        checkoutDate: orgToday(),
        agreedDueDate: inDays(7),
        returnDate: orgToday(),
        checkoutCondition: "Good at checkout",
        returnCondition: "Fine",
      });
    });

    it("shows only a borrower's own completed loans (FR-23)", async () => {
      const { staff, borrower, other } = await fixtures();
      const mine = await completedLoan("MINE-1", borrower.id, staff.id);
      await completedLoan("THEIRS-1", other.id, staff.id);

      const { loans, total } = await listLoans(borrower, query({ status: LoanStatus.Closed }));

      expect(total).toBe(1);
      expect(loans[0].id).toBe(mine.loanId);
    });

    it("does not let a search reach other borrowers' loans (FR-04, FR-23)", async () => {
      const { staff, borrower, other } = await fixtures();
      await completedLoan("THEIRS-1", other.id, staff.id);

      for (const q of ["THEIRS", "Name", other.name, other.email]) {
        const { total } = await listLoans(borrower, query({ status: LoanStatus.Closed, q }));
        expect(total).toBe(0);
      }
    });

    it.each([
      ["item name", "Name FIND"],
      ["item ID", "find-1"],
      ["category", "cat find"],
    ])("lets staff search by %s (FR-23)", async (_label, q) => {
      const { staff, borrower, other } = await fixtures();
      const found = await completedLoan("FIND-1", borrower.id, staff.id);
      await completedLoan("SKIP-1", other.id, staff.id);

      const { loans } = await listLoans(staff, query({ status: LoanStatus.Closed, q }));

      expect(loans.map((loan) => loan.id)).toEqual([found.loanId]);
    });

    it("lets staff search by borrower (FR-23)", async () => {
      const { staff, borrower, other } = await fixtures();
      const found = await completedLoan("FIND-1", borrower.id, staff.id);
      await completedLoan("SKIP-1", other.id, staff.id);

      for (const q of [borrower.name, borrower.email]) {
        const { loans } = await listLoans(staff, query({ status: LoanStatus.Closed, q }));
        expect(loans.map((loan) => loan.id)).toEqual([found.loanId]);
      }
    });

    it("treats a wildcard in a search as plain text", async () => {
      const { staff, borrower } = await fixtures();
      await completedLoan("FIND-1", borrower.id, staff.id);

      const { total } = await listLoans(staff, query({ status: LoanStatus.Closed, q: "%" }));
      expect(total).toBe(0);
    });

    it("shows the latest returns first", async () => {
      const { staff, borrower } = await fixtures();
      const first = await completedLoan("A-1", borrower.id, staff.id);
      const second = await completedLoan("B-1", borrower.id, staff.id);

      const { loans } = await listLoans(staff, query({ status: LoanStatus.Closed }));

      expect(loans.map((loan) => loan.id)).toEqual([second.loanId, first.loanId]);
    });

    it("leaves active loans out of history", async () => {
      const { staff, borrower, item: camera } = await fixtures();
      await borrowFlow(staff.id, borrower.id, camera.id);

      const { total } = await listLoans(staff, query({ status: LoanStatus.Closed }));
      expect(total).toBe(0);
    });

    it("keeps references when the item is later edited (INV-03)", async () => {
      const { staff, borrower } = await fixtures();
      const { loanId, itemId } = await completedLoan("OLD-1", borrower.id, staff.id);

      await updateItem(staff.id, itemId, { itemCode: "NEW-1", name: "Renamed" });

      expect((await getLoan(loanId, borrower)).item).toMatchObject({
        itemCode: "NEW-1",
        name: "Renamed",
      });
    });

    it("refuses to delete an item or borrower with history (FR-06, INV-03)", async () => {
      const { staff, borrower } = await fixtures();
      const { itemId } = await completedLoan("OLD-1", borrower.id, staff.id);

      await expect(prisma.item.delete({ where: { id: itemId } })).rejects.toThrow();
      await expect(prisma.user.delete({ where: { id: borrower.id } })).rejects.toThrow();
    });
  });

  describe("full lifecycle (SRS section 4, INV-01, INV-02)", () => {
    it("holds the invariants at every step", async () => {
      const { staff, borrower, other, item: camera } = await fixtures();

      const { id: requestId } = await createRequest(borrower.id, {
        itemId: camera.id,
        intendedUse: "Use",
        requestedReturnDate: inDays(5),
      });
      await assertInvariants();

      await approveRequest(staff.id, requestId);
      expect((await item(camera.id)).status).toBe(ItemStatus.Held);
      await assertInvariants();

      const loan = await checkoutRequest(staff.id, requestId, {
        checkoutDate: orgToday(),
        agreedDueDate: inDays(5),
        checkoutCondition: "Good",
      });
      expect((await item(camera.id)).status).toBe(ItemStatus.CheckedOut);
      await assertInvariants();

      await returnLoan(staff.id, loan.id, returnInput({ itemOutcome: ItemStatus.Unavailable }));
      expect((await item(camera.id)).status).toBe(ItemStatus.Unavailable);
      await assertInvariants();

      await clearItem(staff.id, camera.id, {});
      expect((await item(camera.id)).status).toBe(ItemStatus.Available);
      await assertInvariants();

      const next = await borrowFlow(staff.id, other.id, camera.id);
      await assertInvariants();
      await returnLoan(staff.id, next.loanId, returnInput());
      await assertInvariants();

      const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map(
        (log) => log.action,
      );
      expect(actions).toEqual([
        AuditAction.RequestApproved,
        AuditAction.ItemCheckedOut,
        AuditAction.ItemReturned,
        AuditAction.ItemCleared,
        AuditAction.RequestApproved,
        AuditAction.ItemCheckedOut,
        AuditAction.ItemReturned,
      ]);
    });
  });
});
