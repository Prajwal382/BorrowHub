// Prisma passes "contains" through to LIKE, so a search for "100%" must not act as a wildcard.
export function containsText(text: string) {
  return { contains: text.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const };
}
