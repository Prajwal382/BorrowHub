import "dotenv/config";
import bcrypt from "bcrypt";
import { ItemStatus, Role } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";

const DEMO_PASSWORD = "BorrowHub#2026";
const BCRYPT_ROUNDS = 12;

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

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to create demo accounts in production.");
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

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

  console.log(`Seeded ${users.length} users and ${items.length} items.`);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
