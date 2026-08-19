import assert from "node:assert/strict";
import test from "node:test";
import type { TargetCompany } from "../domain/opportunity.ts";
import { discoverEightfoldJobs, extractEightfoldJobs } from "./eightfold.ts";

const target: TargetCompany = {
  id: "nvidia", name: "NVIDIA", domain: "nvidia.com", priority: "HIGH",
  roleKeywords: ["intern"], eventKeywords: [], createdAt: "2026-08-19T00:00:00.000Z",
  sources: [{ id: "source", kind: "CAREERS", url: "https://jobs.nvidia.com/careers", enabled: true, scanCron: "* * * * *" }],
};

test("normalizes eligible Eightfold positions and rejects recruiting jobs", () => {
    const jobs = extractEightfoldJobs({ status: 200, data: { positions: [
      { id: 1, name: "Software Engineering Intern", standardizedLocations: ["Austin, TX, US"], department: "Intern", positionUrl: "/careers/job/1" },
      { id: 2, name: "University Recruiting Program Manager", positionUrl: "/careers/job/2" },
      { id: 3, name: "Solution Architect Manager - Intern Program", positionUrl: "/careers/job/3" },
    ] } }, "https://jobs.nvidia.com", target.sources[0], target, "2026-08-19T00:00:00.000Z");

  assert.equal(jobs.length, 1);
  assert.deepEqual(
    { title: jobs[0].title, employmentType: jobs[0].employmentType, canonicalUrl: jobs[0].canonicalUrl, extractionConfidence: jobs[0].extractionConfidence },
    { title: "Software Engineering Intern", employmentType: "INTERNSHIP", canonicalUrl: "https://jobs.nvidia.com/careers/job/1", extractionConfidence: 0.98 },
  );
});

test("paginates and deduplicates Eightfold search results", async () => {
    let calls = 0;
    const fetchJson = async (url: string) => {
      calls += 1;
      const start = Number(new URL(url).searchParams.get("start"));
      return { status: 200, data: { count: 2, positions: [{ id: start + 1, name: `Engineering Intern ${start + 1}`, positionUrl: `/careers/job/${start + 1}` }] } };
    };
    const jobs = await discoverEightfoldJobs(target.sources[0], target, "2026-08-19T00:00:00.000Z", fetchJson);
    assert.equal(jobs.length, 2);
    assert.equal(calls, 2);
});
