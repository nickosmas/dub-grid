import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { FIT_TEXT_MEASURE_TEST_ID } from "../shared/components/fit-text-measure-id";
import { resetSheetPresentationTracking } from "../shared/lib/modal-presentation";

// The sheet-depth counter is module state. Testing Library unmounts between
// tests, which balances it, but a test that throws mid-render can leave a sheet
// counted forever and fail every later test in the file for the wrong reason.
afterEach(() => {
  resetSheetPresentationTracking();
});

// FitText renders a hidden second copy of every button label to measure its
// natural width. Text queries would otherwise find two "Sign in"s; the
// visible one is the label a test means.
configure({ defaultIgnore: `script, style, [data-testid="${FIT_TEXT_MEASURE_TEST_ID}"] *` });

// jsdom's own localStorage sometimes fails to install here — Node's own
// experimental global `localStorage` getter (which throws without
// `--localstorage-file`) wins instead, even though the identical
// `environment: "jsdom"` setup works fine in apps/web. Reproduces with a
// bare-minimum config (no aliases, no plugins), so it's a Node/jsdom version
// interaction, not anything in this app's config. A plain in-memory
// polyfill sidesteps it regardless of the underlying cause.
if (typeof window !== "undefined" && typeof window.localStorage?.getItem !== "function") {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length() {
      return this.store.size;
    }

    clear() {
      this.store.clear();
    }

    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null;
    }

    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string) {
      this.store.delete(key);
    }

    setItem(key: string, value: string) {
      this.store.set(key, String(value));
    }
  }

  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}
