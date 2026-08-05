import { expect, test } from "vitest";
import { confirm } from "./confirm";

// The guarantee is fail-closed, not "asks nicely": without the isTTY guard,
// readline resolves immediately on EOF under `< /dev/null` and in CI, and that
// empty answer would read as consent to a spend nobody saw. The runner has no
// TTY, which is what makes this reachable — and the timeout is the point too,
// since a regression that drops the guard hangs waiting for an answer.
test("fails closed when stdin is not a TTY", { timeout: 1000 }, async () => {
  expect(process.stdin.isTTY).toBeFalsy();
  await expect(confirm("Proceed?")).resolves.toBe(false);
});
