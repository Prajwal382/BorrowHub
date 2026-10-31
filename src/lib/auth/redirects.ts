const DEFAULT_PATH = "/dashboard";

// Only same-site paths are followed after login, so a crafted link cannot send a
// freshly signed-in user to another site.
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_PATH;
  }
  return next;
}
