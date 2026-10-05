import assert from "node:assert/strict";
import test from "node:test";
import type { TargetCompany } from "../domain/opportunity.ts";
import { nextSourceRunAt, sourceBaseIntervalMs, sourceScanOutcomes } from "./source-schedule.ts";

function target(name = "Stripe", scanCron = "* * * * *"): TargetCompany {
  return {
    id: "company-1", name, domain: "example.com", priority: "HIGH", roleKeywords: [], eventKeywords: [],
    createdAt: "2026-10-04T00:00:00.000Z",
    sources: [{ id: "source-1", kind: "CAREERS", url: "https://example.com/jobs", enabled: true, scanCron }],
  };
}

test("assigns fast cadence only to curated companies with structured providers", () => {
  assert.equal(sourceBaseIntervalMs(target("Stripe"), "GREENHOUSE"), 5 * 60_000);
  assert.equal(sourceBaseIntervalMs(target("Other"), "GREENHOUSE"), 15 * 60_000);
  assert.equal(sourceBaseIntervalMs(target("Stripe"), "GENERIC_HTML"), 30 * 60_000);
});

test("applies exponential failure backoff and preserves cron constraints", () => {
  const attemptedAt = new Date("2026-10-04T12:01:30.000Z");
  assert.equal(nextSourceRunAt(target("Other", "*/15 * * * *"), target("Other", "*/15 * * * *").sources[0], "GREENHOUSE", 0, attemptedAt).toISOString(), "2026-10-04T12:30:00.000Z");
  assert.equal(nextSourceRunAt(target(), target().sources[0], "GREENHOUSE", 2, attemptedAt).toISOString(), "2026-10-04T12:22:00.000Z");
});

test("turns every claimed source into a success or failure outcome", () => {
  const claimed = target();
  const outcomes = sourceScanOutcomes([claimed], [], [], new Map([["source-1", 2]]), new Date("2026-10-04T12:00:00.000Z"));
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].succeeded, false);
  assert.match(outcomes[0].error ?? "", /no outcome/i);
  assert.equal(outcomes[0].nextRunAt, "2026-10-04T16:00:00.000Z");
});
