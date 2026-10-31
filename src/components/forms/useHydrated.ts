import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False in the server-rendered HTML and until React has attached its event handlers.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
