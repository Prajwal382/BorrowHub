export type Notice = {
  text: string;
  tone: "success" | "error";
  path: string;
};

type NoticeOptions = {
  tone?: Notice["tone"];
  // The page the message belongs on, when the form is about to navigate there.
  path?: string;
};

let current: Notice | undefined;
const listeners = new Set<() => void>();

function publish(notice: Notice | undefined) {
  current = notice;
  listeners.forEach((listener) => listener());
}

// NFR-04: confirmations live outside the page, because the action that triggers one often
// removes the form that made it (an approved request leaves the Pending list, for example).
export function showNotice(text: string, { tone = "success", path }: NoticeOptions = {}) {
  publish({ text, tone, path: path ?? window.location.pathname });
}

export function dismissNotice() {
  publish(undefined);
}

export function currentNotice() {
  return current;
}

export function subscribeToNotices(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
