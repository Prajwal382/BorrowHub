import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuditAction, ItemStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { orgToday, addDays } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  approveRequest,
  cancelHold,
  createRequest,
  getRequest,
  hasOpenRequest,
  listRequests,
  rejectRequest,
  REQUESTS_PAGE_SIZE,
} from "@/lib/services/requestService";
import { rejectRequestSchema, requestQuerySchema } from "@/lib/validation/requests";
import { createTestItem, createUser, resetDatabase, withFailingAuditLog } from "../helpers";

const tomorrow = () => addDays(orgToday(), 1);

function input(itemId: string, overrides: Partial<{ requestedReturnDate: Date }> = {}) {
  return { itemId, intendedUse: "Class project", requestedReturnDate: tomorrow(), ...overrides };
}

async function itemStatus(id: string) {
  return (await prisma.item.findUniqueOrThrow({ where: { id } })).status;
}

async function requestStatus(id: string) {
  return (await prisma.request.findUniqueOrThrow({ where: { id } })).status;
}

async function fixtures() {
  const [staff, borrower, otherBorrower, item] = await Promise.all([
    createUser("staff", Role.Staff),
    createUser("borrower"),
    createUser("other"),
    createTestItem("CAM-1"),
  ]);
  return { staff, borrower, otherBorrower, item };
}

describe("requestService", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  describe("createRequest (FR-09, FR-10)", () => {
    it("stores a valid request as Pending, leaving the item Available", async () => {
      const { borrower, item } = await fixtures();
      const request = await createRequest(borrower.id, input(item.id));

      expect(request.status).toBe(RequestStatus.Pending);
      expect(request.borrowerId).toBe(borrower.id);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Available);
    });

    it.each([
      ["today", 0],
      ["yesterday", -1],
    ])("rejects a return date of %s", async (_label, days) => {
      const { borrower, item } = await fixtures();
      const error = await createRequest(
        borrower.id,
        input(item.id, { requestedReturnDate: addDays(orgToday(), days) }),
      ).catch((caught) => caught);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.requestedReturnDate).toHaveLength(1);
      await expect(prisma.request.count()).resolves.toBe(0);
    });

    it("judges 'after today' in the organization's time zone, not UTC", async () => {
      const { borrower, item } = await fixtures();
      // 11:30 pm on Nov 9 in Chicago, when it is already Nov 10 in UTC.
      const lateEvening = new Date("2026-11-10T05:30:00Z");

      await expect(
        createRequest(
          borrower.id,
          input(item.id, { requestedReturnDate: new Date("2026-11-10") }),
          lateEvening,
        ),
      ).resolves.toBeDefined();
    });

    it("rejects the current local day even when UTC has moved on", async () => {
      const { borrower, item } = await fixtures();
      const lateEvening = new Date("2026-11-10T05:30:00Z");

      await expect(
        createRequest(
          borrower.id,
          input(item.id, { requestedReturnDate: new Date("2026-11-09") }),
          lateEvening,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it.each([ItemStatus.Held, ItemStatus.CheckedOut, ItemStatus.Unavailable])(
      "refuses a request for a %s item (FR-08)",
      async (status) => {
        const borrower = await createUser("borrower");
        const item = await createTestItem("CAM-1", { status });

        await expect(createRequest(borrower.id, input(item.id))).rejects.toBeInstanceOf(
          ConflictError,
        );
        await expect(prisma.request.count()).resolves.toBe(0);
      },
    );

    it("reports an item that does not exist", async () => {
      const borrower = await createUser("borrower");
      await expect(createRequest(borrower.id, input("missing"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("refuses a duplicate pending request from the same borrower", async () => {
      const { borrower, item } = await fixtures();
      await createRequest(borrower.id, input(item.id));

      await expect(createRequest(borrower.id, input(item.id))).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(prisma.request.count()).resolves.toBe(1);
    });

    it("creates only one request when the same form is submitted twice at once", async () => {
      const { borrower, item } = await fixtures();
      const results = await Promise.allSettled([
        createRequest(borrower.id, input(item.id)),
        createRequest(borrower.id, input(item.id)),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      await expect(prisma.request.count()).resolves.toBe(1);
    });

    it("allows different borrowers to request the same item", async () => {
      const { borrower, otherBorrower, item } = await fixtures();
      await createRequest(borrower.id, input(item.id));
      await expect(createRequest(otherBorrower.id, input(item.id))).resolves.toBeDefined();
    });
  });

  describe("approveRequest (FR-12)", () => {
    it("approves, places the hold, and audits the decision (NFR-06)", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));

      const approved = await approveRequest(staff.id, id);

      expect(approved.status).toBe(RequestStatus.Approved);
      expect(approved.item.status).toBe(ItemStatus.Held);
      expect(approved.decidedBy?.name).toBe("staff");
      expect(approved.decidedAt).toBeInstanceOf(Date);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
      await expect(prisma.auditLog.findFirst()).resolves.toMatchObject({
        actorId: staff.id,
        action: AuditAction.RequestApproved,
        entityId: id,
      });
    });

    it.each([ItemStatus.Unavailable, ItemStatus.CheckedOut, ItemStatus.Held])(
      "fails without any change when the item is %s (FR-12, NFR-03)",
      async (status) => {
        const { staff, borrower, item } = await fixtures();
        const { id } = await createRequest(borrower.id, input(item.id));
        await prisma.item.update({ where: { id: item.id }, data: { status } });

        await expect(approveRequest(staff.id, id)).rejects.toBeInstanceOf(ConflictError);

        // The rolled-back approval leaves no trace.
        const request = await prisma.request.findUniqueOrThrow({ where: { id } });
        expect(request).toMatchObject({
          status: RequestStatus.Pending,
          decidedById: null,
          decidedAt: null,
        });
        await expect(itemStatus(item.id)).resolves.toBe(status);
        await expect(prisma.auditLog.count()).resolves.toBe(0);
      },
    );

    it("rolls everything back if the audit row cannot be written (NFR-03, NFR-06)", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));

      // Fails the last write of the transaction, after the request and item have changed.
      await withFailingAuditLog(async () => {
        await expect(approveRequest(staff.id, id)).rejects.toThrow("audit log unavailable");
      });

      const request = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(request).toMatchObject({ status: RequestStatus.Pending, decidedById: null });
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Available);
    });

    it("refuses a request that is not Pending", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await rejectRequest(staff.id, id, "No");

      await expect(approveRequest(staff.id, id)).rejects.toBeInstanceOf(ConflictError);
      await expect(requestStatus(id)).resolves.toBe(RequestStatus.Rejected);
    });

    it("reports a request that does not exist", async () => {
      const { staff } = await fixtures();
      await expect(approveRequest(staff.id, "missing")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("gives exactly one hold when staff race on one request (AC-02, INV-01)", async () => {
      const { staff, borrower, item } = await fixtures();
      const otherStaff = await createUser("staff2", Role.Staff);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await prisma.auditLog.deleteMany();
        await prisma.request.deleteMany();
        await prisma.item.update({
          where: { id: item.id },
          data: { status: ItemStatus.Available },
        });
        const { id } = await createRequest(borrower.id, input(item.id));

        const results = await Promise.allSettled([
          approveRequest(staff.id, id),
          approveRequest(otherStaff.id, id),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
        await expect(prisma.auditLog.count()).resolves.toBe(1);
      }
    });

    it("gives exactly one hold when staff race on two requests for one item (AC-02, INV-01)", async () => {
      const { staff, borrower, otherBorrower, item } = await fixtures();
      const otherStaff = await createUser("staff2", Role.Staff);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await prisma.auditLog.deleteMany();
        await prisma.request.deleteMany();
        await prisma.item.update({
          where: { id: item.id },
          data: { status: ItemStatus.Available },
        });
        const first = await createRequest(borrower.id, input(item.id));
        const second = await createRequest(otherBorrower.id, input(item.id));

        const results = await Promise.allSettled([
          approveRequest(staff.id, first.id),
          approveRequest(otherStaff.id, second.id),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
        await expect(
          prisma.request.count({ where: { status: RequestStatus.Approved } }),
        ).resolves.toBe(1);
        // FR-13: the loser stays Pending rather than being rejected.
        await expect(
          prisma.request.count({ where: { status: RequestStatus.Pending } }),
        ).resolves.toBe(1);
        await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
        await expect(prisma.auditLog.count()).resolves.toBe(1);
      }
    });
  });

  describe("other pending requests during a hold (FR-13)", () => {
    it("stay pending and cannot be approved until the hold ends", async () => {
      const { staff, borrower, otherBorrower, item } = await fixtures();
      const first = await createRequest(borrower.id, input(item.id));
      const second = await createRequest(otherBorrower.id, input(item.id));

      await approveRequest(staff.id, first.id);
      await expect(requestStatus(second.id)).resolves.toBe(RequestStatus.Pending);
      await expect(approveRequest(staff.id, second.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(requestStatus(second.id)).resolves.toBe(RequestStatus.Pending);

      await cancelHold(staff.id, first.id);
      const approved = await approveRequest(staff.id, second.id);
      expect(approved.status).toBe(RequestStatus.Approved);
    });

    it("can still be rejected during the hold", async () => {
      const { staff, borrower, otherBorrower, item } = await fixtures();
      const first = await createRequest(borrower.id, input(item.id));
      const second = await createRequest(otherBorrower.id, input(item.id));
      await approveRequest(staff.id, first.id);

      await rejectRequest(staff.id, second.id, "Item is on hold");

      await expect(requestStatus(second.id)).resolves.toBe(RequestStatus.Rejected);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
    });
  });

  describe("rejectRequest (FR-11)", () => {
    it("records the reason, audits it, and leaves the item alone", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));

      const rejected = await rejectRequest(staff.id, id, "Reserved for a class");

      expect(rejected).toMatchObject({
        status: RequestStatus.Rejected,
        rejectionReason: "Reserved for a class",
      });
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Available);
      await expect(prisma.auditLog.findFirst()).resolves.toMatchObject({
        actorId: staff.id,
        action: AuditAction.RequestRejected,
      });
    });

    it("shows the reason to the borrower", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await rejectRequest(staff.id, id, "Reserved for a class");

      const view = await getRequest(id, borrower);
      expect(view.rejectionReason).toBe("Reserved for a class");
    });

    it.each(["", "   "])("requires a reason, refusing %j", (reason) => {
      expect(rejectRequestSchema.safeParse({ reason }).success).toBe(false);
    });

    it("refuses a request that is not Pending", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await approveRequest(staff.id, id);

      await expect(rejectRequest(staff.id, id, "Too late")).rejects.toBeInstanceOf(ConflictError);
      await expect(requestStatus(id)).resolves.toBe(RequestStatus.Approved);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
    });

    it("lets only one decision win when approval and rejection race", async () => {
      const { staff, borrower, item } = await fixtures();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await prisma.auditLog.deleteMany();
        await prisma.request.deleteMany();
        await prisma.item.update({
          where: { id: item.id },
          data: { status: ItemStatus.Available },
        });
        const { id } = await createRequest(borrower.id, input(item.id));

        const [approval, rejection] = await Promise.allSettled([
          approveRequest(staff.id, id),
          rejectRequest(staff.id, id, "No"),
        ]);

        expect(approval.status).not.toBe(rejection.status);
        const expectedItem =
          approval.status === "fulfilled" ? ItemStatus.Held : ItemStatus.Available;
        await expect(itemStatus(item.id)).resolves.toBe(expectedItem);
      }
    });
  });

  describe("cancelHold (FR-14, AC-07)", () => {
    it("cancels, releases the item, and audits the action (NFR-06)", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await approveRequest(staff.id, id);

      const cancelled = await cancelHold(staff.id, id);

      expect(cancelled.status).toBe(RequestStatus.Cancelled);
      expect(cancelled.cancelledBy?.name).toBe("staff");
      expect(cancelled.item.status).toBe(ItemStatus.Available);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Available);
      await expect(
        prisma.auditLog.findFirst({ where: { action: AuditAction.HoldCancelled } }),
      ).resolves.toMatchObject({ actorId: staff.id, entityId: id });
    });

    it("rolls everything back if the audit row cannot be written (NFR-03, NFR-06)", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await approveRequest(staff.id, id);

      await withFailingAuditLog(async () => {
        await expect(cancelHold(staff.id, id)).rejects.toThrow("audit log unavailable");
      });

      await expect(requestStatus(id)).resolves.toBe(RequestStatus.Approved);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Held);
    });

    it("leaves another blocking status in place (FR-14)", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await approveRequest(staff.id, id);
      await prisma.item.update({
        where: { id: item.id },
        data: { status: ItemStatus.Unavailable },
      });

      const cancelled = await cancelHold(staff.id, id);

      expect(cancelled.status).toBe(RequestStatus.Cancelled);
      expect(cancelled.item.status).toBe(ItemStatus.Unavailable);
      await expect(itemStatus(item.id)).resolves.toBe(ItemStatus.Unavailable);
    });

    it.each([RequestStatus.Pending, RequestStatus.Rejected, RequestStatus.Cancelled])(
      "refuses a %s request (SRS section 4)",
      async (status) => {
        const { staff, borrower, item } = await fixtures();
        const request = await createRequest(borrower.id, input(item.id));
        await prisma.request.update({
          where: { id: request.id },
          data: {
            status,
            ...(status === RequestStatus.Rejected && { rejectionReason: "No" }),
          },
        });

        await expect(cancelHold(staff.id, request.id)).rejects.toBeInstanceOf(ConflictError);
        await expect(requestStatus(request.id)).resolves.toBe(status);
      },
    );

    it("releases the item only once when two staff cancel at once", async () => {
      const { staff, borrower, otherBorrower, item } = await fixtures();
      const otherStaff = await createUser("staff2", Role.Staff);
      const { id } = await createRequest(borrower.id, input(item.id));
      await approveRequest(staff.id, id);

      const results = await Promise.allSettled([
        cancelHold(staff.id, id),
        cancelHold(otherStaff.id, id),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      await expect(
        prisma.auditLog.count({ where: { action: AuditAction.HoldCancelled } }),
      ).resolves.toBe(1);

      // The item can be held again afterwards.
      const next = await createRequest(otherBorrower.id, input(item.id));
      await expect(approveRequest(staff.id, next.id)).resolves.toBeDefined();
    });
  });

  describe("visibility (FR-04, FR-10, AC-06)", () => {
    it("lists only a borrower's own requests", async () => {
      const { borrower, otherBorrower, item } = await fixtures();
      const mine = await createRequest(borrower.id, input(item.id));
      await createRequest(otherBorrower.id, input(item.id));

      const { requests, total } = await listRequests(borrower, requestQuerySchema.parse({}));

      expect(total).toBe(1);
      expect(requests.map((request) => request.id)).toEqual([mine.id]);
    });

    it.each([Role.Staff, Role.Administrator])("lists every request for a %s", async (role) => {
      const { borrower, otherBorrower, item } = await fixtures();
      const actor = await createUser("viewer", role);
      await createRequest(borrower.id, input(item.id));
      await createRequest(otherBorrower.id, input(item.id));

      const { total } = await listRequests(actor, requestQuerySchema.parse({}));
      expect(total).toBe(2);
    });

    it("hides another borrower's request as if it did not exist", async () => {
      const { borrower, otherBorrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));

      await expect(getRequest(id, otherBorrower)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("hides which staff member decided from the borrower, but not from staff", async () => {
      const { staff, borrower, item } = await fixtures();
      const { id } = await createRequest(borrower.id, input(item.id));
      await approveRequest(staff.id, id);

      const borrowerView = await getRequest(id, borrower);
      expect(borrowerView).not.toHaveProperty("decidedBy");
      expect(borrowerView).not.toHaveProperty("cancelledBy");
      expect((await getRequest(id, staff)).decidedBy?.name).toBe("staff");
    });

    it("filters by status and serves the pending queue oldest first", async () => {
      const { staff, borrower, otherBorrower, item } = await fixtures();
      const returnDate = new Date("2026-12-01");
      const first = await createRequest(
        borrower.id,
        input(item.id, { requestedReturnDate: returnDate }),
        new Date("2026-11-01T12:00:00Z"),
      );
      const second = await createRequest(
        otherBorrower.id,
        input(item.id, { requestedReturnDate: returnDate }),
        new Date("2026-11-01T13:00:00Z"),
      );

      const pending = await listRequests(
        staff,
        requestQuerySchema.parse({ status: RequestStatus.Pending }),
      );
      expect(pending.requests.map((request) => request.id)).toEqual([first.id, second.id]);

      const approved = await listRequests(
        staff,
        requestQuerySchema.parse({ status: RequestStatus.Approved }),
      );
      expect(approved.total).toBe(0);
    });

    it("paginates", async () => {
      const staff = await createUser("staff", Role.Staff);
      for (let index = 0; index < REQUESTS_PAGE_SIZE + 2; index += 1) {
        const borrower = await createUser(`b${index}`);
        const item = await createTestItem(`ITEM-${index}`);
        await createRequest(borrower.id, input(item.id));
      }

      const first = await listRequests(staff, requestQuerySchema.parse({}));
      const beyond = await listRequests(staff, requestQuerySchema.parse({ page: 99 }));

      expect(first.requests).toHaveLength(REQUESTS_PAGE_SIZE);
      expect(first.pageCount).toBe(2);
      expect(beyond.page).toBe(2);
      expect(beyond.requests).toHaveLength(2);
    });
  });

  describe("hasOpenRequest", () => {
    it("is true only while a request is Pending or Approved", async () => {
      const { staff, borrower, item } = await fixtures();
      await expect(hasOpenRequest(borrower.id, item.id)).resolves.toBe(false);

      const { id } = await createRequest(borrower.id, input(item.id));
      await expect(hasOpenRequest(borrower.id, item.id)).resolves.toBe(true);

      await approveRequest(staff.id, id);
      await expect(hasOpenRequest(borrower.id, item.id)).resolves.toBe(true);

      await cancelHold(staff.id, id);
      await expect(hasOpenRequest(borrower.id, item.id)).resolves.toBe(false);
    });
  });
});
