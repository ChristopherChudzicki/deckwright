import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { SB_URL, server } from "./msw";

// Mock @iconify/react's Icon component. Iconify's real Icon, when mounted
// with a string ref ("game-icons:trident") whose data isn't already in
// storage, calls loadIcons(...) which schedules a setTimeout(0) to dispatch
// the resulting setState. If that timer fires after vitest has torn down
// jsdom (between test files), React's dispatchSetState reads `window`,
// finds nothing, and the run dies with an unhandled "window is not defined".
// Tests assert on wrapper attributes (data-icon-key, data-frame, aria-*),
// not on iconify's internal SVG output, so a stub Icon is safe.
//
// Only Icon is replaced — addCollection / iconLoaded / listIcons stay real
// because IconPickerDialog uses listIcons("", "game-icons") to enumerate
// available icons, and resolveIcon's dev-time warning calls iconLoaded.
vi.mock("@iconify/react", async () => {
  const actual = await vi.importActual<typeof import("@iconify/react")>("@iconify/react");
  return {
    ...actual,
    Icon: ({ icon, ...props }: { icon: string | { body: string } } & Record<string, unknown>) =>
      createElement("svg", {
        ...props,
        "data-icon-ref": typeof icon === "string" ? icon : "inline",
        "aria-hidden": "true",
      }),
  };
});

// Replace the ~4000-icon game-icons bundle with a tiny fixture so picker
// tests don't pay full-collection filter/render cost on every keystroke.
// Add a key here if a test references it; resolveIcon's dev-time warning
// fires (loudly) for any name not in this set, so missing keys surface fast.
const STUB_ICON = { body: "<path d='M0 0h512v512H0z'/>" };
vi.mock("@iconify-json/game-icons/icons.json", () => ({
  default: {
    prefix: "game-icons",
    width: 512,
    height: 512,
    icons: {
      trident: STUB_ICON,
      broadsword: STUB_ICON,
    },
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
class ResizeObserverMock implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverMock;

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
