import "server-only";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSessionOptions, type SessionData } from "@/lib/auth/session-config";

export async function getSession() {
  // Checking the cookie's expiry reads the clock, which Next.js forbids during prerendering.
  // This stops the prerender here so the session is only ever read at request time.
  await connection();
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function startSession(userId: string) {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}

export async function endSession() {
  const session = await getSession();
  session.destroy();
}
