import "dotenv/config";
import { ItemStatus, RequestStatus, Role } from "../src/generated/prisma/client";
import { addDays, orgToday } from "../src/lib/dates";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/services/authService";

const DEMO_PASSWORD = "BorrowHub#2026";

const users = [
  { email: "admin@borrowhub.test", name: "Avery Admin", role: Role.Administrator },
  { email: "staff@borrowhub.test", name: "Sam Staff", role: Role.Staff },
  { email: "borrower1@borrowhub.test", name: "Blake Borrower", role: Role.Borrower },
  { email: "borrower2@borrowhub.test", name: "Riley Borrower", role: Role.Borrower },
];

const items = [
  {
    itemCode: "CAM-001",
    name: "Canon EOS R50 Camera",
    description: "Mirrorless camera with 18-45mm lens, battery, and charger.",
    category: "Cameras",
    conditionNotes: "Good. Minor scuff on the grip.",
  },
  {
    itemCode: "CAM-002",
    name: "Sony ZV-E10 Camera",
    description: "Vlogging camera with 16-50mm lens and wind muff.",
    category: "Cameras",
    conditionNotes: "Excellent.",
  },
  {
    itemCode: "LAP-001",
    name: "Dell Latitude 5440 Laptop",
    description: "14-inch laptop with 16 GB RAM and a 65 W charger.",
    category: "Laptops",
    conditionNotes: "Good.",
  },
  {
    itemCode: "LAP-002",
    name: "MacBook Air 13-inch",
    description: "M2 laptop with 8 GB RAM and a USB-C charger.",
    category: "Laptops",
    conditionNotes: "Good. Light wear on the lid.",
  },
  {
    itemCode: "PRJ-001",
    name: "Epson Portable Projector",
    description: "1080p projector with HDMI cable and carry bag.",
    category: "Projectors",
    conditionNotes: "Good.",
  },
  {
    itemCode: "AUD-001",
    name: "Rode VideoMic Go II",
    description: "Compact shotgun microphone with shock mount.",
    category: "Audio",
    conditionNotes: "Excellent.",
  },
  {
    itemCode: "AUD-002",
    name: "Zoom H4n Pro Recorder",
    description: "Four-track handheld audio recorder with SD card.",
    category: "Audio",
    conditionNotes: "Good.",
  },
  {
    itemCode: "TRI-001",
    name: "Manfrotto Compact Tripod",
    description: "Lightweight aluminium tripod with carry bag.",
    category: "Accessories",
    conditionNotes: "Fair. Leg lock is stiff.",
  },
  {
    itemCode: "TAB-001",
    name: "iPad 10th Generation",
    description: "64 GB Wi-Fi tablet with a protective case.",
    category: "Tablets",
    conditionNotes: "Good.",
  },
  {
    itemCode: "VRH-001",
    name: "Meta Quest 3 Headset",
    description: "VR headset with two controllers.",
    category: "Accessories",
    conditionNotes: "Sent for lens cleaning.",
    status: ItemStatus.Unavailable,
  },
];

const OVERDUE_DEMO_REQUEST_ID = "seed-overdue-demo";

// A due date cannot precede its checkout, so a real overdue loan takes days to appear. This one
// is backdated so the overdue views (FR-19, AC-04) can be seen straight away. It is created once,
// and only if its item is free, so re-seeding never disturbs real activity.
async function seedOverdueLoan() {
  const [existing, item, borrower, staff] = await Promise.all([
    prisma.request.findUnique({ where: { id: OVERDUE_DEMO_REQUEST_ID } }),
    prisma.item.findUniqueOrThrow({ where: { itemCode: "PRJ-001" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "borrower2@borrowhub.test" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "staff@borrowhub.test" } }),
  ]);
  if (existing || item.status !== ItemStatus.Available) {
    return false;
  }

  const today = orgToday();
  const checkoutDate = addDays(today, -10);
  const agreedDueDate = addDays(today, -3);

  await prisma.$transaction(async (tx) => {
    await tx.request.create({
      data: {
        id: OVERDUE_DEMO_REQUEST_ID,
        borrowerId: borrower.id,
        itemId: item.id,
        intendedUse: "Demo: projector for a club presentation",
        requestedReturnDate: agreedDueDate,
        submittedAt: checkoutDate,
        status: RequestStatus.Fulfilled,
        decidedById: staff.id,
        decidedAt: checkoutDate,
      },
    });
    await tx.loan.create({
      data: {
        requestId: OVERDUE_DEMO_REQUEST_ID,
        borrowerId: borrower.id,
        itemId: item.id,
        checkoutDate,
        agreedDueDate,
        checkoutCondition: "Good. Demo loan created by the seed script.",
        checkedOutById: staff.id,
      },
    });
    await tx.item.update({ where: { id: item.id }, data: { status: ItemStatus.CheckedOut } });
  });
  return true;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to create demo accounts in production.");
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // Upserts keep the seed safe to run repeatedly without touching item status in use.
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  for (const item of items) {
    await prisma.item.upsert({
      where: { itemCode: item.itemCode },
      update: {},
      create: item,
    });
  }

  const createdLoan = await seedOverdueLoan();

  console.log(`Seeded ${users.length} users and ${items.length} items.`);
  console.log(createdLoan ? "Created a demo overdue loan." : "Left existing loans unchanged.");
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
