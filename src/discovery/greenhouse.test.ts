import assert from "node:assert/strict";
import test from "node:test";
import type { TargetCompany } from "../domain/opportunity.ts";
import { discoverGreenhouseJobs, extractGreenhouseJobs, greenhouseBoard } from "./greenhouse.ts";

const target: TargetCompany = {
  id: "databricks", name: "Databricks", domain: "databricks.com", priority: "HIGH",
  roleKeywords: ["intern", "new grad"], eventKeywords: [], createdAt: "2026-08-20T00:00:00.000Z",
  sources: [{ id: "source", kind: "CAREERS", url: "https://www.databricks.com/company/careers/open-positions", enabled: true, scanCron: "* * * * *" }],
};

test("routes configured companies to their public Greenhouse board", () => {
  assert.equal(greenhouseBoard(target), "databricks");
  assert.equal(greenhouseBoard({ ...target, name: "Stripe" }), "stripe");
});

test("normalizes Greenhouse jobs and structured office locations", () => {
  const jobs = extractGreenhouseJobs({ jobs: [{
    id: 8732364002, title: "Software Engineering Intern (2027 Start) - Winter",
    absolute_url: "https://www.databricks.com/company/careers/open-positions/job/8732364002",
    content: "<p>Build distributed data systems.</p>", location: { name: "Mountain View, California" },
    offices: [{ name: "Bellevue, Washington", location: "Bellevue, Washington" }],
  }] }, target.sources[0], target, "2026-08-20T20:00:00.000Z");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].employmentType, "INTERNSHIP");
  assert.deepEqual(jobs[0].locations, ["Mountain View, California", "Bellevue, Washington"]);
});

test("uses the Greenhouse API instead of the configured landing page", async () => {
  let requested = "";
  const jobs = await discoverGreenhouseJobs(target.sources[0], target, "2026-08-20T20:00:00.000Z", async (url) => {
    requested = url;
    return { jobs: [] };
  });
  assert.equal(jobs.length, 0);
  assert.equal(requested, "https://boards-api.greenhouse.io/v1/boards/databricks/jobs?content=true");
});
