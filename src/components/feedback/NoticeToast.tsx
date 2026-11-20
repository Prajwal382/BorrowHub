"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  currentNotice,
  dismissNotice,
  subscribeToNotices,
  type Notice,
} from "@/components/feedback/notices";

const TONE_CLASSES: Record<Notice["tone"], string> = {
  success: "border-[#1e6b3a]",
  error: "border-[#9b1c1c]",
};

function NoticeCard({ notice }: { notice: Notice }) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border-2 bg-white p-4 shadow-lg ${TONE_CLASSES[notice.tone]}`}
    >
      <p className="min-w-0">{notice.text}</p>
      <button
        type="button"
        onClick={dismissNotice}
        className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-maroon underline"
      >
        Dismiss
      </button>
    </div>
  );
}

// NFR-04: the live regions are always in the page, because screen readers only announce changes
// to one that already exists. It stays fixed in view, so a long list cannot hide the message.
export function NoticeToast() {
  const pathname = usePathname();
  const notice = useSyncExternalStore(subscribeToNotices, currentNotice, () => undefined);

  // A message is done with once the user moves on from the page it belongs to.
  useEffect(() => {
    const active = currentNotice();
    if (active && active.path !== pathname) {
      dismissNotice();
    }
  }, [pathname]);

  const visible = notice?.path === pathname ? notice : undefined;

  return (
    <div className="fixed inset-x-4 bottom-4 z-10 sm:left-auto sm:w-96">
      <div role="status">{visible?.tone === "success" && <NoticeCard notice={visible} />}</div>
      <div role="alert">{visible?.tone === "error" && <NoticeCard notice={visible} />}</div>
    </div>
  );
}
