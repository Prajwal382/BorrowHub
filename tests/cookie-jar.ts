import { AsyncLocalStorage } from "node:async_hooks";

// Stands in for the browser's cookies and the next/headers cookie store in tests.
const shared = new Map<string, string>();
const scoped = new AsyncLocalStorage<Map<string, string>>();
const current = () => scoped.getStore() ?? shared;

export const cookieJar = {
  get(name: string) {
    const value = current().get(name);
    return value === undefined ? undefined : { name, value };
  },
  getAll() {
    return [...current()].map(([name, value]) => ({ name, value }));
  },
  set(name: string, value: string, options?: { maxAge?: number }) {
    if (value === "" || options?.maxAge === 0) {
      current().delete(name);
    } else {
      current().set(name, value);
    }
  },
  clear() {
    current().clear();
  },
};

// Gives work its own cookies, so several signed-in people can act at the same moment.
export function withCookies<Result>(cookies: Map<string, string>, work: () => Result) {
  return scoped.run(cookies, work);
}
