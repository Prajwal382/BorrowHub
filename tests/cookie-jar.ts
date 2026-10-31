// Stands in for the browser's cookies and the next/headers cookie store in tests.
const cookies = new Map<string, string>();

export const cookieJar = {
  get(name: string) {
    const value = cookies.get(name);
    return value === undefined ? undefined : { name, value };
  },
  getAll() {
    return [...cookies].map(([name, value]) => ({ name, value }));
  },
  set(name: string, value: string, options?: { maxAge?: number }) {
    if (value === "" || options?.maxAge === 0) {
      cookies.delete(name);
    } else {
      cookies.set(name, value);
    }
  },
  clear() {
    cookies.clear();
  },
};
