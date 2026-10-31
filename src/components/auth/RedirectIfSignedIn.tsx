import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";

// This checks the database, not just the cookie. A stale cookie for a removed account
// therefore still sees the login form instead of looping between /login and /dashboard.
export async function RedirectIfSignedIn() {
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }
  return null;
}
