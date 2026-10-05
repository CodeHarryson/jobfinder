import assert from "node:assert/strict";
import test from "node:test";
import { sourceFailureStreaks } from "./source-health.ts";

const failure = (sourceId: string, message = "boom") =>
  ({ companyId: "meta", sourceId, sourceUrl: "https://www.metacareers.com/jobs/", provider: "META_CAREERS", message });
const success = (sourceId: string) => ({ companyId: "meta", sourceId, provider: "META_CAREERS", discoveredCount: 3 });

test("counts consecutive failures from the newest scan backwards", () => {
  const streaks = sourceFailureStreaks([
    { startedAt: "2026-09-30T02:00:00.000Z", failures: [failure("s1", "HTTP 502")], sourceResults: [] },
    { startedAt: "2026-09-30T01:00:00.000Z", failures: [failure("s1")], sourceResults: [] },
    { startedAt: "2026-09-30T00:00:00.000Z", failures: [failure("s1")], sourceResults: [] },
  ]);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].consecutiveFailures, 3);
  assert.equal(streaks[0].message, "HTTP 502");
  assert.equal(streaks[0].lastFailedAt, "2026-09-30T02:00:00.000Z");
  assert.equal(streaks[0].firstFailedAt, "2026-09-30T00:00:00.000Z");
});

test("a later success ends the streak and hides older failures", () => {
  const streaks = sourceFailureStreaks([
    { startedAt: "2026-09-30T02:00:00.000Z", failures: [], sourceResults: [success("s1")] },
    { startedAt: "2026-09-30T01:00:00.000Z", failures: [failure("s1")], sourceResults: [] },
    { startedAt: "2026-09-30T00:00:00.000Z", failures: [failure("s1")], sourceResults: [] },
  ]);
  assert.deepEqual(streaks, []);
});

test("a source absent from a scan neither extends nor breaks its streak", () => {
  // Batching means most sources are missing from most scans.
  const streaks = sourceFailureStreaks([
    { startedAt: "2026-09-30T02:00:00.000Z", failures: [failure("s1")], sourceResults: [] },
    { startedAt: "2026-09-30T01:00:00.000Z", failures: [], sourceResults: [success("s2")] },
    { startedAt: "2026-09-30T00:00:00.000Z", failures: [failure("s1")], sourceResults: [] },
  ]);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].consecutiveFailures, 2);
});

test("ranks the worst streak first and tolerates malformed records", () => {
  const streaks = sourceFailureStreaks([
    { startedAt: "2026-09-30T01:00:00.000Z", failures: [failure("s1"), failure("s2"), null, "junk", {}], sourceResults: [] },
    { startedAt: "2026-09-30T00:00:00.000Z", failures: [failure("s2")], sourceResults: [] },
  ]);
  assert.deepEqual(streaks.map((streak) => [streak.sourceId, streak.consecutiveFailures]), [["s2", 2], ["s1", 1]]);
});
