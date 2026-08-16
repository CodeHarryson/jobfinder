import assert from "node:assert/strict";
import test from "node:test";
import { cronMatches, isValidCron } from "./cron.ts";

test("validates and matches common five-field UTC cron expressions", () => {
  const date = new Date("2026-08-16T14:30:00.000Z");
  assert.equal(isValidCron("* * * * *"), true);
  assert.equal(isValidCron("*/15 9-17 * * 1-5"), true);
  assert.equal(isValidCron("not a cron"), false);
  assert.equal(cronMatches("*/15 9-17 * * 0", date), true);
  assert.equal(cronMatches("0 * * * *", date), false);
});
