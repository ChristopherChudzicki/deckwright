import { describe, expect, test } from "vitest";
import { relativeTime } from "./relativeTime";

const now = new Date("2026-05-22T12:00:00Z");

describe("relativeTime", () => {
  test("minutes ago", () => {
    expect(relativeTime("2026-05-22T11:30:00Z", now)).toBe("30 minutes ago");
  });

  test("hours ago", () => {
    expect(relativeTime("2026-05-22T10:00:00Z", now)).toBe("2 hours ago");
  });

  test("days ago", () => {
    expect(relativeTime("2026-05-19T12:00:00Z", now)).toBe("3 days ago");
  });

  test("seconds ago uses 'now' bucket", () => {
    expect(relativeTime("2026-05-22T11:59:50Z", now)).toBe("now");
  });
});
