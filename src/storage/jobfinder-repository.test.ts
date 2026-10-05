import assert from "node:assert/strict";
import test from "node:test";
import { createTargetCompany, updateTargetCompany } from "../domain/target-company.ts";
import { JobFinderRepository } from "./jobfinder-repository.ts";
import type { JobPosting } from "../domain/opportunity.ts";

test("persists, updates, and deletes targets with sources", () => {
  const repository = new JobFinderRepository();
  const created = createTargetCompany({ name: "Notion", domain: "notion.com", careerUrl: "https://notion.com/careers", eventsUrl: "https://notion.com/events" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  repository.saveTarget(created.value);
  assert.equal(repository.listTargets()[0].sources.length, 2);

  const updated = updateTargetCompany(created.value, { name: "Notion Labs", domain: "notion.com", careerUrl: "https://notion.com/jobs" });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  repository.saveTarget(updated.value);
  assert.equal(repository.listTargets()[0].name, "Notion Labs");
  assert.equal(repository.listTargets()[0].sources.length, 1);
  assert.equal(repository.deleteTarget(created.value.id), true);
  assert.equal(repository.listTargets().length, 0);
  repository.close();
});

test("upserts discovered jobs by company and canonical URL", () => {
  const repository = new JobFinderRepository();
  const created = createTargetCompany({ name: "Notion", domain: "notion.com", careerUrl: "https://notion.com/careers" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  repository.saveTarget(created.value);
  const job: JobPosting = {
    kind: "JOB", id: "job-1", companyId: created.value.id, sourceId: created.value.sources[0].id,
    sourceUrl: created.value.sources[0].url, canonicalUrl: "https://jobs.example/1", applicationUrl: "https://jobs.example/1",
    title: "Software Intern", description: "First", locations: [], employmentType: "INTERNSHIP",
    firstSeenAt: "2026-08-16T00:00:00.000Z", lastSeenAt: "2026-08-16T00:00:00.000Z", contentFingerprint: "one", extractionConfidence: 0.7,
  };
  assert.equal(repository.saveJobs([job])[0].kind, "NEW");
  assert.equal(repository.saveJobs([job]).length, 0);
  assert.equal(repository.saveJobs([{ ...job, description: "Formatting-only upstream change", contentFingerprint: "description-only" }]).length, 0,
    "description-only changes do not create noisy alerts");
  assert.equal(repository.saveJobs([{ ...job, title: "Software Engineering Intern", description: "Updated", contentFingerprint: "two", lastSeenAt: "2026-08-16T01:00:00.000Z" }])[0].kind, "UPDATED");
  assert.equal(repository.listJobs().length, 1);
  assert.equal(repository.listJobs()[0].title, "Software Engineering Intern");
  assert.deepEqual(repository.listDiscoveryChanges().map(({ kind }) => kind), ["UPDATED", "NEW"]);
  const notifications = repository.listNotifications();
  assert.equal(notifications[0].companyName, "Notion");
  assert.equal(notifications[0].jobTitle, "Software Engineering Intern");
  assert.equal(repository.markNotificationRead(notifications[0].id), true);
  assert.equal(repository.listNotifications(true).length, 1);
  assert.equal(repository.markAllNotificationsRead(), 1);
  assert.equal(repository.listNotifications(true).length, 0);
  assert.equal(repository.deleteNotification(notifications[0].id), true);
  repository.saveJobs([], [created.value.sources[0].id]);
  assert.equal(repository.listJobs().length, 1, "one missed scan keeps the role active");
  repository.saveJobs([], [created.value.sources[0].id]);
  assert.equal(repository.listJobs().length, 0, "two consecutive missed scans mark the role inactive");
  repository.close();
});

test("reserves a durable scan cursor for every invocation", () => {
  const repository = new JobFinderRepository();
  assert.deepEqual([repository.reserveScanCursor(), repository.reserveScanCursor(), repository.reserveScanCursor()], [0, 1, 2]);
  repository.close();
});

test("claims overdue sources with priority, leases them, and records completion", () => {
  const repository = new JobFinderRepository();
  const stripe = createTargetCompany({ name: "Stripe", domain: "stripe.com", careerUrl: "https://stripe.com/jobs/search" });
  const other = createTargetCompany({ name: "Other", domain: "other.example", careerUrl: "https://other.example/jobs" });
  assert.equal(stripe.ok, true); assert.equal(other.ok, true);
  if (!stripe.ok || !other.ok) return;
  repository.saveTargets([other.value, stripe.value]);
  const now = new Date("2026-10-04T12:00:00.000Z");
  const first = repository.claimDueSources(now, 1, 4 * 60_000, ["Stripe"]);
  assert.deepEqual(first.map(({ name }) => name), ["Stripe"]);
  assert.deepEqual(repository.claimDueSources(now, 1, 4 * 60_000, ["Stripe"]).map(({ name }) => name), ["Other"]);
  const sourceId = stripe.value.sources[0].id;
  repository.completeSourceScans([{ sourceId, provider: "GREENHOUSE", succeeded: false, error: "HTTP 429",
    attemptedAt: now.toISOString(), nextRunAt: "2026-10-04T12:30:00.000Z" }]);
  assert.equal(repository.getSourceFailureCounts([sourceId]).get(sourceId), 1);
  assert.equal(repository.claimDueSources(new Date("2026-10-04T12:29:00.000Z"), 2, 4 * 60_000, ["Stripe"]).some(({ name }) => name === "Stripe"), false);
  assert.equal(repository.claimDueSources(new Date("2026-10-04T12:30:00.000Z"), 2, 4 * 60_000, ["Stripe"]).some(({ name }) => name === "Stripe"), true);
  repository.close();
});

test("persists provider-level discovery health for the latest scan", () => {
  const repository = new JobFinderRepository();
  repository.recordScan({ startedAt: "2026-08-20T01:00:00.000Z", finishedAt: "2026-08-20T01:00:02.000Z",
    targetCount: 1, jobCount: 3, failures: [], sourceResults: [{ companyId: "company-1", provider: "GREENHOUSE", discoveredCount: 4, unitedStatesCount: 3 }] });
  const health = repository.getDiscoveryHealth();
  assert.equal(health?.jobCount, 3);
  assert.deepEqual(health?.sourceResults, [{ companyId: "company-1", provider: "GREENHOUSE", discoveredCount: 4, unitedStatesCount: 3 }]);
  assert.deepEqual(health?.companyHealth, [{ companyId: "company-1", lastAttemptedAt: "2026-08-20T01:00:00.000Z", status: "SUCCESS",
    providers: ["GREENHOUSE"], discoveredCount: 4, unitedStatesCount: 3, errors: [] }]);
  repository.close();
});

test("does not deliver queued alerts for jobs omitted by the latest successful scan", () => {
  const repository = new JobFinderRepository();
  const created = createTargetCompany({ name: "Qualcomm", domain: "qualcomm.com", careerUrl: "https://careers.qualcomm.com/careers" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  repository.saveTarget(created.value);
  const job: JobPosting = { kind: "JOB", id: "foreign-job", companyId: created.value.id, sourceId: created.value.sources[0].id,
    sourceUrl: created.value.sources[0].url, canonicalUrl: "https://careers.qualcomm.com/careers/job/foreign",
    applicationUrl: "https://careers.qualcomm.com/careers/job/foreign", title: "Engineering Intern", description: "",
    locations: ["Cork, CO, IE"], employmentType: "INTERNSHIP", firstSeenAt: "2026-08-21T00:00:00.000Z",
    lastSeenAt: "2026-08-21T00:00:00.000Z", contentFingerprint: "foreign", extractionConfidence: 0.98 };
  const changes = repository.saveJobs([job]);
  assert.equal(repository.enqueueDiscordDeliveries(changes), 1);
  repository.saveJobs([], [created.value.sources[0].id]);
  assert.equal(repository.claimDiscordDeliveries().length, 0);
  repository.close();
});

test("returns scan history newest first for failure-streak analysis", () => {
  const repository = new JobFinderRepository();
  repository.recordScan({ startedAt: "2026-09-30T00:00:00.000Z", finishedAt: "2026-09-30T00:00:05.000Z", targetCount: 1, jobCount: 0,
    failures: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", message: "Source returned HTTP 502." }], sourceResults: [] });
  repository.recordScan({ startedAt: "2026-09-30T01:00:00.000Z", finishedAt: "2026-09-30T01:00:05.000Z", targetCount: 1, jobCount: 6,
    failures: [], sourceResults: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", discoveredCount: 6 }] });
  const history = repository.listScanHistory();
  assert.deepEqual(history.map((scan) => scan.startedAt), ["2026-09-30T01:00:00.000Z", "2026-09-30T00:00:00.000Z"]);
  assert.equal((history[0].sourceResults[0] as { discoveredCount: number }).discoveredCount, 6);
  assert.equal((history[1].failures[0] as { message: string }).message, "Source returned HTTP 502.");
});

test("grants one source alert claim per cooldown window and re-grants after a clear", () => {
  const repository = new JobFinderRepository();
  const cooldown = 12 * 60 * 60 * 1000;
  assert.equal(repository.claimSourceAlert("s1", cooldown, new Date("2026-09-30T00:00:00.000Z")), true);
  assert.equal(repository.claimSourceAlert("s1", cooldown, new Date("2026-09-30T06:00:00.000Z")), false);
  assert.equal(repository.claimSourceAlert("s2", cooldown, new Date("2026-09-30T06:00:00.000Z")), true);
  assert.equal(repository.claimSourceAlert("s1", cooldown, new Date("2026-09-30T13:00:00.000Z")), true);
  repository.clearSourceAlert("s1");
  assert.equal(repository.claimSourceAlert("s1", cooldown, new Date("2026-09-30T13:30:00.000Z")), true);
});
