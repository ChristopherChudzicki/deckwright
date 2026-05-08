import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnonUsersEnabled } from "./anonEnabled";

describe("isAnonUsersEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when VITE_ANON_USERS_ENABLED === "true"', () => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
    expect(isAnonUsersEnabled()).toBe(true);
  });

  it("returns false when the env var is unset", () => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "");
    expect(isAnonUsersEnabled()).toBe(false);
  });

  it('returns false for any non-"true" value', () => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "1");
    expect(isAnonUsersEnabled()).toBe(false);
  });
});
