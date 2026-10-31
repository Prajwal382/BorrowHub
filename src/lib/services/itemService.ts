import { AuditAction, ItemStatus, Prisma, type Role } from "@/generated/prisma/client";
import { isStaff } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { CatalogQuery, CreateItemInput, UpdateItemInput } from "@/lib/validation/items";

export const CATALOG_PAGE_SIZE = 20;

const itemSelect = {
  id: true,
  itemCode: true,
  name: true,
  description: true,
  category: true,
  conditionNotes: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ItemSelect;

type ItemRecord = Prisma.ItemGetPayload<{ select: typeof itemSelect }>;

// conditionNotes is present only for staff and administrators.
export type CatalogItem = Omit<ItemRecord, "conditionNotes"> & { conditionNotes?: string };

// FR-07 promises borrowers availability and description; condition notes stay with staff.
function forRole(item: ItemRecord, role: Role): CatalogItem {
  const { conditionNotes, ...visible } = item;
  return isStaff(role) ? { ...visible, conditionNotes } : visible;
}

// Prisma passes these through to LIKE, so a search for "100%" must not act as a wildcard.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// FR-07: search by name or category, or by item ID so staff can find a unit they are holding.
function catalogWhere({ q, category, status }: CatalogQuery): Prisma.ItemWhereInput {
  const contains = q ? { contains: escapeLike(q), mode: "insensitive" as const } : undefined;
  return {
    ...(contains && {
      OR: [{ name: contains }, { category: contains }, { itemCode: contains }],
    }),
    ...(category && { category: { equals: category, mode: "insensitive" as const } }),
    ...(status && { status }),
  };
}

export async function searchItems(query: CatalogQuery, role: Role) {
  const where = catalogWhere(query);
  const total = await prisma.item.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);

  const items = await prisma.item.findMany({
    where,
    select: itemSelect,
    orderBy: [{ name: "asc" }, { itemCode: "asc" }],
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE,
  });

  return {
    items: items.map((item) => forRole(item, role)),
    total,
    page,
    pageCount,
    pageSize: CATALOG_PAGE_SIZE,
  };
}

export async function listCategories() {
  const rows = await prisma.item.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((row) => row.category);
}

export async function getItem(id: string, role: Role): Promise<CatalogItem> {
  const item = await prisma.item.findUnique({ where: { id }, select: itemSelect });
  if (!item) {
    throw new NotFoundError("That item could not be found.");
  }
  return forRole(item, role);
}

// Reuses an existing category's spelling so "cameras" does not split off from "Cameras".
async function canonicalCategory(tx: Prisma.TransactionClient, category: string) {
  const existing = await tx.item.findFirst({
    where: { category: { equals: category, mode: "insensitive" } },
    select: { category: true },
    orderBy: { createdAt: "asc" },
  });
  return existing?.category ?? category;
}

function rethrowDuplicateCode(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const message = "Another item already uses this item ID.";
    throw new ConflictError(message, { itemCode: [message] }); // FR-06
  }
  throw error;
}

export async function createItem(actorId: string, input: CreateItemInput): Promise<ItemRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: { ...input, category: await canonicalCategory(tx, input.category) },
        select: itemSelect,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: AuditAction.ItemCreated,
          entityType: "Item",
          entityId: item.id,
          details: { itemCode: item.itemCode },
        },
      });
      return item;
    });
  } catch (error) {
    rethrowDuplicateCode(error);
  }
}

// SRS section 4, INV-02: an edit may only take an Available item out of circulation. Holds and
// loans own the other states, and returning to Available requires explicit clearance.
function assertStatusChangeAllowed(from: ItemStatus, to: ItemStatus) {
  if (from === ItemStatus.Available && to === ItemStatus.Unavailable) {
    return;
  }
  if (from === ItemStatus.Unavailable) {
    throw new ConflictError("An unavailable item must be cleared before it can be requested.");
  }
  throw new ConflictError(
    "This item is on hold or checked out, so its status changes through that process.",
  );
}

const EDITABLE_FIELDS = [
  "itemCode",
  "name",
  "description",
  "category",
  "conditionNotes",
  "status",
] as const;

export async function updateItem(
  actorId: string,
  id: string,
  input: UpdateItemInput,
): Promise<ItemRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id }, select: itemSelect });
      if (!item) {
        throw new NotFoundError("That item could not be found.");
      }

      const data = {
        ...input,
        ...(input.category !== undefined && {
          category: await canonicalCategory(tx, input.category),
        }),
      };
      const changed = EDITABLE_FIELDS.filter(
        (field) => data[field] !== undefined && data[field] !== item[field],
      );
      if (changed.length === 0) {
        return item;
      }

      const statusChanging = changed.includes("status");
      if (statusChanging) {
        assertStatusChangeAllowed(item.status, data.status!);
      }

      // INV-02: the status condition stops this overwriting a hold placed since the read above.
      const [updated] = await tx.item.updateManyAndReturn({
        where: { id, ...(statusChanging && { status: item.status }) },
        data,
        select: itemSelect,
      });
      if (!updated) {
        throw new ConflictError("This item just changed. Reload the page and try again.");
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: AuditAction.ItemUpdated,
          entityType: "Item",
          entityId: id,
          details: {
            changed,
            ...(statusChanging && { statusFrom: item.status, statusTo: updated.status }),
          },
        },
      });
      return updated;
    });
  } catch (error) {
    rethrowDuplicateCode(error);
  }
}
