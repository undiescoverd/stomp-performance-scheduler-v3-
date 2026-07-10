// Node 25 enables an experimental global `localStorage` (the "--localstorage-file
// was provided without a valid path" warning) that lacks getItem/setItem, which
// crashes MSW's cookieStore on import. Install a real in-memory Storage before
// any test module (incl. MSW) loads. Listed first in vitest setupFiles.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
}

const needsPolyfill =
  typeof (globalThis as any).localStorage?.getItem !== "function";

if (needsPolyfill) {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
