import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { SB_URL, server } from "./msw";

// Replace the ~4000-icon game-icons bundle with a tiny fixture so picker
// tests don't pay full-collection filter/render cost on every keystroke.
// Add a key here if a test references it (resolveIcon's dev-time warning
// fires for any name not in this set).
vi.mock("@iconify-json/game-icons/icons.json", () => ({
  default: {
    prefix: "game-icons",
    width: 512,
    height: 512,
    icons: Object.fromEntries(
      [
        "trident",
        "broadsword",
        "fireball",
        "sword",
        "shield",
        "axe",
        "bow",
        "dragon",
        "scroll",
        "staff",
      ].map((name) => [name, { body: "<path d='M0 0h512v512H0z'/>" }]),
    ),
  },
}));

vi.stubEnv("VITE_SUPABASE_URL", SB_URL);
vi.stubEnv(
  "VITE_SUPABASE_ANON_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key.signature",
);

// react-aria-components' Virtualizer reads container size via clientWidth /
// clientHeight + a ResizeObserver. jsdom doesn't implement ResizeObserver and
// returns 0 for clientWidth/clientHeight; without these stubs the Virtualizer
// either falls back to Infinity (NaN math in GridLayout) or sees a 0x0
// container and renders no items.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverMock as unknown as typeof ResizeObserver;

// Hard-coded dimensions are large enough for ~150 60px tiles to land in the
// initial visible window — the actual layout in browsers is responsive.
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return 1200;
  },
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return 900;
  },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
