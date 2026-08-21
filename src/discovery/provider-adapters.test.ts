import assert from "node:assert/strict";
import test from "node:test";
import type { TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { extractAshbyJobs } from "./ashby.ts";
import { extractLeverJobs } from "./lever.ts";
import { extractOracleHcmJobs, oracleHcmConfig } from "./oracle-hcm.ts";
import { extractPhenomJobs, phenomConfig } from "./phenom.ts";
import { extractWorkdayJobs, workdayConfig } from "./workday.ts";

const source: TargetSource = { id: "source", kind: "CAREERS", url: "https://example.com/careers", enabled: true, scanCron: "* * * * *" };
const target = (name: string): TargetCompany => ({
  id: name.toLowerCase(), name, domain: "example.com", priority: "HIGH", roleKeywords: ["intern"], eventKeywords: [],
  sources: [source], createdAt: "2026-08-20T00:00:00.000Z",
});
const observedAt = "2026-08-20T12:00:00.000Z";

test("normalizes Ashby postings and secondary locations", () => {
  const jobs = extractAshbyJobs({ jobs: [{ title: "Software Engineer Intern", location: "San Francisco, CA",
    secondaryLocations: [{ location: "New York, NY" }], descriptionPlain: "Build products", jobUrl: "https://jobs.ashbyhq.com/ramp/id", applyUrl: "https://jobs.ashbyhq.com/ramp/id/application" }] }, source, target("Ramp"), observedAt);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].locations, ["San Francisco, CA", "New York, NY"]);
});

test("normalizes Lever postings", () => {
  const jobs = extractLeverJobs([{ text: "Software Engineering Intern", hostedUrl: "https://jobs.lever.co/spotify/id",
    applyUrl: "https://jobs.lever.co/spotify/id/apply", descriptionPlain: "Audio systems", categories: { location: "New York, NY; Boston, MA", commitment: "Intern" } }], source, target("Spotify"), observedAt);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].locations, ["New York, NY", "Boston, MA"]);
});

test("normalizes Workday result pages", () => {
  const company = target("Intel");
  const config = workdayConfig(company)!;
  const jobs = extractWorkdayJobs({ total: 1, jobPostings: [{ title: "Software Engineering Intern", externalPath: "/job/Intern_R123",
    locationsText: "US, California, Santa Clara | US, Oregon, Hillsboro", bulletFields: ["Student role"] }] }, config, source, company, observedAt);
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].canonicalUrl, /intel\.wd1\.myworkdayjobs\.com/);
});

test("normalizes Phenom widget results", () => {
  const company = target("Cisco");
  const config = phenomConfig(company)!;
  const jobs = extractPhenomJobs({ refineSearch: { data: { totalHits: 1, jobs: [{ title: "Software Engineer Intern",
    jobId: "123", jobUrl: "/global/en/job/123", city: "San Jose", state: "California", country: "United States" }] } } }, config, source, company, observedAt);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].locations, ["San Jose, California, United States"]);
});

test("normalizes Oracle HCM result pages", () => {
  const company = target("Dell");
  const config = oracleHcmConfig(company)!;
  const jobs = extractOracleHcmJobs({ items: [{ Id: 42, ExternalTitle: "Software Engineering Intern", PrimaryLocation: "Austin, Texas, United States" }] }, config, source, company, observedAt);
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].canonicalUrl, /\/job\/42$/);
});
