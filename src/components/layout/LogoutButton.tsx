"use client";

import { useState } from "react";
import { sendJson } from "@/lib/api/client";

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();

  async function handleLogout() {
    setSubmitting(true);
    setMessage(undefined);
    const result = await sendJson("/api/auth/logout", "POST");
    if (result.ok) {
      // A full page load, because Next.js keeps visited pages alive but hidden. This removes
      // the signed-out user's content from the browser's memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
      return;
    }
    setMessage(result.message);
    setSubmitting(false);
  }

  return (
    <>
      <button type="button" onClick={handleLogout} disabled={submitting} className="underline">
        {submitting ? "Logging out…" : "Log out"}
      </button>
      {message && (
        <span role="alert" className="error-text">
          {message}
        </span>
      )}
    </>
  );
}
