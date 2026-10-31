import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuditAction, ItemStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { isRequestable } from "@/lib/itemStatus";
import {
  CATALOG_PAGE_SIZE,
  createItem,
  getItem,
  listCategories,
  searchItems,
  updateItem,
} from "@/lib/services/itemService";
import { catalogQuerySchema, createItemSchema, updateItemSchema } from "@/lib/validation/items";
import { createTestItem, createUser, resetDatabase } from "../helpers";

const newItem = {
  itemCode: "cam-100",
  name: "New Camera",
  description: "A camera.",
  category: "Cameras",
};

const query = (input: Record<string, unknown> = {}) => catalogQuerySchema.parse(input);
const names = async (input: Record<string, unknown>) =>
  (await searchItems(query(input), Role.Borrower)).items.map((item) => item.name);

describe("itemService", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  describe("createItem (FR-05, FR-06)", () => {
    it("creates an Available item and audits it (NFR-06)", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const item = await createItem(admin.id, createItemSchema.parse(newItem));

      expect(item).toMatchObject({
        itemCode: "CAM-100",
        status: ItemStatus.Available,
        conditionNotes: "",
      });
      await expect(prisma.auditLog.findFirst()).resolves.toMatchObject({
        actorId: admin.id,
        action: AuditAction.ItemCreated,
        entityId: item.id,
      });
    });

    it("rejects a duplicate item ID whatever its case, and writes no audit row", async () => {
      const admin = await createUser("admin", Role.Administrator);
      await createItem(admin.id, createItemSchema.parse(newItem));

      const error = await createItem(
        admin.id,
        createItemSchema.parse({ ...newItem, itemCode: " CAM-100 " }),
      ).catch((caught) => caught);

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.fields.itemCode).toHaveLength(1);
      await expect(prisma.item.count()).resolves.toBe(1);
      await expect(prisma.auditLog.count()).resolves.toBe(1);
    });

    it("reuses an existing category's spelling", async () => {
      const admin = await createUser("admin", Role.Administrator);
      await createTestItem("EXISTING", { category: "Cameras" });
      const item = await createItem(
        admin.id,
        createItemSchema.parse({ ...newItem, category: "CAMERAS" }),
      );

      expect(item.category).toBe("Cameras");
      await expect(listCategories()).resolves.toEqual(["Cameras"]);
    });

    it.each([ItemStatus.Held, ItemStatus.CheckedOut])("cannot create a %s item", (status) => {
      expect(createItemSchema.safeParse({ ...newItem, status }).success).toBe(false);
    });

    it("gives one clear message for a blank item ID (NFR-02)", () => {
      const result = createItemSchema.safeParse({ ...newItem, itemCode: "  " });
      expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Enter an item ID."]);
    });

    it.each(["", "   ", "has space", "-leading", "a/b", "x".repeat(33)])(
      "rejects the item ID %j (NFR-02)",
      (itemCode) => {
        expect(createItemSchema.safeParse({ ...newItem, itemCode }).success).toBe(false);
      },
    );
  });

  describe("updateItem (FR-05)", () => {
    it("updates fields and audits what changed (NFR-06)", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const item = await createTestItem("CAM-1");

      const updated = await updateItem(admin.id, item.id, {
        name: "Renamed",
        conditionNotes: "Ok",
      });

      expect(updated).toMatchObject({ name: "Renamed", conditionNotes: "Ok" });
      const log = await prisma.auditLog.findFirst();
      expect(log).toMatchObject({ actorId: admin.id, action: AuditAction.ItemUpdated });
      expect(log?.details).toEqual({ changed: ["name", "conditionNotes"] });
    });

    it("does not audit an edit that changes nothing", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const item = await createTestItem("CAM-1");

      await updateItem(admin.id, item.id, { name: item.name, status: ItemStatus.Available });
      await expect(prisma.auditLog.count()).resolves.toBe(0);
    });

    it("rejects changing to another item's ID (FR-06)", async () => {
      const admin = await createUser("admin", Role.Administrator);
      await createTestItem("CAM-1");
      const other = await createTestItem("CAM-2");

      await expect(updateItem(admin.id, other.id, { itemCode: "CAM-1" })).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(prisma.auditLog.count()).resolves.toBe(0);
    });

    it("keeps history attached when an item ID changes (FR-06, INV-03)", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const borrower = await createUser("borrower");
      const item = await createTestItem("CAM-1");
      const request = await prisma.request.create({
        data: {
          borrowerId: borrower.id,
          itemId: item.id,
          intendedUse: "Test",
          requestedReturnDate: new Date("2026-12-01"),
          status: RequestStatus.Pending,
        },
      });

      await updateItem(admin.id, item.id, { itemCode: "CAM-9" });

      const found = await prisma.request.findUnique({
        where: { id: request.id },
        select: { item: { select: { itemCode: true } } },
      });
      expect(found?.item.itemCode).toBe("CAM-9");
    });

    it("reports a missing item", async () => {
      const admin = await createUser("admin", Role.Administrator);
      await expect(updateItem(admin.id, "missing", { name: "x" })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    describe("status changes (SRS section 4, INV-02)", () => {
      it("allows Available to Unavailable and records it", async () => {
        const admin = await createUser("admin", Role.Administrator);
        const item = await createTestItem("CAM-1");

        const updated = await updateItem(admin.id, item.id, { status: ItemStatus.Unavailable });

        expect(updated.status).toBe(ItemStatus.Unavailable);
        expect((await prisma.auditLog.findFirst())?.details).toEqual({
          changed: ["status"],
          statusFrom: ItemStatus.Available,
          statusTo: ItemStatus.Unavailable,
        });
      });

      it.each([
        [ItemStatus.Unavailable, ItemStatus.Available],
        [ItemStatus.Held, ItemStatus.Available],
        [ItemStatus.Held, ItemStatus.Unavailable],
        [ItemStatus.CheckedOut, ItemStatus.Available],
        [ItemStatus.CheckedOut, ItemStatus.Unavailable],
      ])("refuses %s to %s", async (from, to) => {
        const admin = await createUser("admin", Role.Administrator);
        const item = await createTestItem("CAM-1", { status: from });

        await expect(updateItem(admin.id, item.id, { status: to })).rejects.toBeInstanceOf(
          ConflictError,
        );
        await expect(prisma.item.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
          status: from,
        });
        await expect(prisma.auditLog.count()).resolves.toBe(0);
      });

      it.each([ItemStatus.Held, ItemStatus.CheckedOut])(
        "refuses to set %s through an edit",
        (status) => {
          expect(updateItemSchema.safeParse({ status }).success).toBe(false);
        },
      );

      it("still allows editing details of a held item", async () => {
        const admin = await createUser("admin", Role.Administrator);
        const item = await createTestItem("CAM-1", { status: ItemStatus.Held });

        const updated = await updateItem(admin.id, item.id, { conditionNotes: "Scratched" });

        expect(updated).toMatchObject({ conditionNotes: "Scratched", status: ItemStatus.Held });
      });

      it("does not overwrite a hold placed during the edit", async () => {
        const admin = await createUser("admin", Role.Administrator);
        const item = await createTestItem("CAM-1");

        // Run the edit and a competing status change at once, many times over. Whatever the
        // order, the final state must never be Unavailable after the hold was placed.
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await prisma.item.update({
            where: { id: item.id },
            data: { status: ItemStatus.Available },
          });
          const [edit] = await Promise.allSettled([
            updateItem(admin.id, item.id, { status: ItemStatus.Unavailable }),
            prisma.item.updateMany({
              where: { id: item.id, status: ItemStatus.Available },
              data: { status: ItemStatus.Held },
            }),
          ]);

          const { status } = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
          if (edit.status === "rejected") {
            expect(edit.reason).toBeInstanceOf(ConflictError);
            expect(status).toBe(ItemStatus.Held);
          } else {
            expect(status).toBe(ItemStatus.Unavailable);
          }
        }
      });
    });
  });

  describe("searchItems (FR-07)", () => {
    beforeEach(async () => {
      await createTestItem("CAM-1", { name: "Canon Camera", category: "Cameras" });
      await createTestItem("LAP-1", { name: "Dell Laptop", category: "Laptops" });
      await createTestItem("AUD-1", {
        name: "Boom Mic",
        category: "Audio",
        status: ItemStatus.Unavailable,
      });
    });

    it("returns everything with no filters, sorted by name", async () => {
      await expect(names({})).resolves.toEqual(["Boom Mic", "Canon Camera", "Dell Laptop"]);
    });

    it("searches by name, ignoring case", async () => {
      await expect(names({ q: "cANON" })).resolves.toEqual(["Canon Camera"]);
    });

    it("searches by category, ignoring case", async () => {
      await expect(names({ q: "laptops" })).resolves.toEqual(["Dell Laptop"]);
    });

    it("searches by item ID", async () => {
      await expect(names({ q: "aud-1" })).resolves.toEqual(["Boom Mic"]);
    });

    it("filters by exact category", async () => {
      await expect(names({ category: "audio" })).resolves.toEqual(["Boom Mic"]);
      await expect(names({ category: "Aud" })).resolves.toEqual([]);
    });

    it("combines search and filters", async () => {
      await expect(names({ q: "Camera", category: "Laptops" })).resolves.toEqual([]);
    });

    it("filters by availability so staff can view status (FR-08)", async () => {
      await expect(names({ status: ItemStatus.Unavailable })).resolves.toEqual(["Boom Mic"]);
    });

    it.each(["%", "_", "\\"])("treats %j as plain text, not a wildcard", async (q) => {
      await expect(names({ q })).resolves.toEqual([]);
    });

    it("finds text containing a wildcard character", async () => {
      await createTestItem("PCT-1", { name: "100% Cotton Backdrop" });
      await expect(names({ q: "100%" })).resolves.toEqual(["100% Cotton Backdrop"]);
    });

    it("ignores invalid filters from a URL", () => {
      expect(query({ page: "abc", status: "Nope", q: "x".repeat(101) })).toEqual({ page: 1 });
      expect(query({ q: ["a", "b"] })).toEqual({ page: 1 });
    });
  });

  describe("pagination", () => {
    beforeEach(async () => {
      for (let index = 0; index < CATALOG_PAGE_SIZE + 3; index += 1) {
        await createTestItem(`ITEM-${String(index).padStart(3, "0")}`);
      }
    });

    it("returns one page at a time", async () => {
      const first = await searchItems(query(), Role.Borrower);
      const second = await searchItems(query({ page: 2 }), Role.Borrower);

      expect(first.items).toHaveLength(CATALOG_PAGE_SIZE);
      expect(first).toMatchObject({ total: CATALOG_PAGE_SIZE + 3, page: 1, pageCount: 2 });
      expect(second.items).toHaveLength(3);
    });

    it("shows the last page when asked for one past the end", async () => {
      const result = await searchItems(query({ page: 99 }), Role.Borrower);
      expect(result.page).toBe(2);
      expect(result.items).toHaveLength(3);
    });
  });

  describe("condition notes", () => {
    it("hides them from borrowers (FR-07)", async () => {
      const item = await createTestItem("CAM-1", { conditionNotes: "Internal note" });

      expect(await getItem(item.id, Role.Borrower)).not.toHaveProperty("conditionNotes");
      const { items } = await searchItems(query(), Role.Borrower);
      expect(items[0]).not.toHaveProperty("conditionNotes");
      expect(JSON.stringify(items)).not.toContain("Internal note");
    });

    it.each([Role.Staff, Role.Administrator])("shows them to a %s", async (role) => {
      const item = await createTestItem("CAM-1", { conditionNotes: "Internal note" });

      expect((await getItem(item.id, role)).conditionNotes).toBe("Internal note");
    });
  });

  describe("getItem", () => {
    it("reports a missing item", async () => {
      await expect(getItem("missing", Role.Borrower)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

describe("isRequestable (FR-08)", () => {
  it("allows only Available items", () => {
    expect(isRequestable(ItemStatus.Available)).toBe(true);
    expect(isRequestable(ItemStatus.Held)).toBe(false);
    expect(isRequestable(ItemStatus.CheckedOut)).toBe(false);
    expect(isRequestable(ItemStatus.Unavailable)).toBe(false);
  });
});
