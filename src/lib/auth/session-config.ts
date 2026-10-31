import type { SessionOptions } from "iron-session";

export type SessionData = { userId: string };

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MIN_SECRET_LENGTH = 32;

export function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters. See .env.example.`,
    );
  }

  return {
    cookieName: "borrowhub_session",
    password,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}
