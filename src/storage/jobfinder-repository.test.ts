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
  repository.saveJobs([job]);
  repository.saveJobs([{ ...job, title: "Software Engineering Intern", description: "Updated", lastSeenAt: "2026-08-16T01:00:00.000Z" }]);
  assert.equal(repository.listJobs().length, 1);
  assert.equal(repository.listJobs()[0].title, "Software Engineering Intern");
  repository.close();
});
