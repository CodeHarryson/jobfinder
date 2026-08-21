import assert from "node:assert/strict";
import test from "node:test";
import type { TargetCompany } from "../domain/opportunity.ts";
import { discoverJibeJobs, extractJibeJobs, jibeConfig } from "./jibe.ts";

const target: TargetCompany = {
  id: "amd", name: "AMD", domain: "amd.com", priority: "HIGH",
  roleKeywords: ["intern", "new grad"], eventKeywords: [], createdAt: "2026-08-20T00:00:00.000Z",
  sources: [{ id: "source", kind: "CAREERS", url: "https://careers.amd.com/careers-home", enabled: true, scanCron: "* * * * *" }],
};

test("normalizes AMD Jibe jobs including additional locations", () => {
  const jobs = extractJibeJobs({ jobs: [{ data: {
    slug: "90947", title: "Summer 2027 Undergrad Software Engineering Intern",
    description: "<p>Develop GPU software.</p>", apply_url: "https://campus-amd.icims.com/jobs/90947/login",
    city: "Austin", state: "Texas", country: "United States", country_code: "US",
    additional_locations: [{ city: "San Jose", state: "California", country_code: "US" }],
  } }] }, "https://careers.amd.com", target.sources[0], target, "2026-08-20T23:28:00.000Z");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].canonicalUrl, "https://careers.amd.com/jobs/90947");
  assert.deepEqual(jobs[0].locations, ["Austin, Texas, US", "San Jose, California, US"]);
});

test("paginates the AMD student API with U.S. filters", async () => {
  const urls: string[] = [];
  const jobs = await discoverJibeJobs(target.sources[0], target, "2026-08-20T23:28:00.000Z", async (url) => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get("page"));
    return { totalCount: 11, jobs: page === 1
      ? Array.from({ length: 10 }, (_, index) => ({ data: { slug: String(index), title: `Software Intern ${index}`, country: "United States" } }))
      : [{ data: { slug: "10", title: "Software Intern 10", country: "United States" } }] };
  });
  assert.equal(jibeConfig(target)?.apiOrigin, "https://careers.amd.com");
  assert.equal(jobs.length, 11);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /categories=Student\+%2F\+Intern\+%2F\+Temp/);
  assert.match(urls[0], /country=United\+States/);
});
