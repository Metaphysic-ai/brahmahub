import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.stubGlobal("__APP_VERSION__", "v1.0.0");
vi.stubGlobal("__APP_COMMIT__", "abc1234");
vi.stubGlobal("__APP_BUILD_DATE__", "2025-01-01T00:00:00Z");

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
