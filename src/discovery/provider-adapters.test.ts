import assert from "node:assert/strict";
import test from "node:test";
import type { TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { extractAshbyJobs } from "./ashby.ts";
import { extractLeverJobs } from "./lever.ts";
import { extractOracleHcmJobs, oracleHcmConfig } from "./oracle-hcm.ts";
import { extractPhenomJobs, phenomConfig } from "./phenom.ts";
import { isUnitedStatesJob } from "./scan-targets.ts";
import { discoverWorkdayJobs, extractWorkdayJobs, workdayConfig, workdayDiscoveryQueries } from "./workday.ts";
import { extractAmazonJobs, isAmazon } from "./amazon.ts";
import { extractSalesforceJobs, isSalesforce } from "./salesforce.ts";
import { extractGoogleCareersJobs, isGoogleCareers } from "./google-careers.ts";

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

test("uses precise Workday early-career queries before broad fallbacks", async () => {
  const company = target("Mastercard");
  company.roleKeywords = ["intern", "internship", "new grad", "graduate", "early career", "university"];
  assert.deepEqual(workdayDiscoveryQueries(company), ["internship", "intern", "graduate", "early career", "new grad"]);

  const searches: string[] = [];
  const jobs = await discoverWorkdayJobs(source, company, observedAt, async (_url, init) => {
    const searchText = String(JSON.parse(String(init?.body)).searchText);
    searches.push(searchText);
    return searchText === "internship"
      ? { total: 1, jobPostings: [{ title: "Software Engineering Intern", externalPath: "/job/US_R123", locationsText: "O'Fallon, Missouri" }] }
      : { total: 0, jobPostings: [] };
  });
  assert.equal(jobs.length, 1);
  assert.equal(searches[0], "internship");
});

test("discovers Mastercard Campus launch and internship roles with multi-location labels", () => {
  const company = target("Mastercard");
  company.roleKeywords = ["intern", "internship", "new grad", "graduate", "early career", "university"];
  const config = workdayConfig(company)!;
  const jobs = extractWorkdayJobs({ total: 2, jobPostings: [
    { title: "Software Engineer, Launch Program 2027 – United States", externalPath: "/job/OFallon-Missouri/Software-Engineer--Launch-Program-2027---United-States_R-288578-1", locationsText: "6 Locations", bulletFields: ["R-288578"] },
    { title: "Software Engineer Intern, Summer 2027 – United States", externalPath: "/job/OFallon-Missouri/Software-Engineer-Intern--Summer-2027---United-States_R-287618-1", locationsText: "4 Locations", bulletFields: ["R-287618"] },
  ] }, config, source, company, observedAt);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((job) => job.locations), [["OFallon, Missouri"], ["OFallon, Missouri"]]);
  assert.deepEqual(jobs.map((job) => job.employmentType), ["NEW_GRAD", "INTERNSHIP"]);
  assert.deepEqual(jobs.map(isUnitedStatesJob), [true, true]);
  assert.match(jobs[0].canonicalUrl, /\/Campus\/job\//);
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

test("normalizes Amazon's public search feed and preserves all U.S. locations", () => {
  const company = target("Amazon");
  company.domain = "amazon.jobs";
  const jobs = extractAmazonJobs({ hits: 1, jobs: [{
    title: "Software Development Engineer Intern, Annapurna Labs - 2027",
    job_path: "/en/jobs/10517567/software-development-engineer-intern-annapurna-labs-2027",
    url_next_step: "https://account.amazon.jobs/jobs/10517567/apply",
    description: "Build production software.",
    locations: [JSON.stringify({ normalizedLocation: "Austin, Texas, USA" }), JSON.stringify({ normalizedLocation: "Seattle, Washington, USA" })],
  }] }, source, company, observedAt);
  assert.equal(isAmazon(company), true);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].locations, ["Austin, Texas, USA", "Seattle, Washington, USA"]);
  assert.equal(jobs[0].employmentType, "INTERNSHIP");
});

test("normalizes Salesforce's published careers dataset including college-grad roles", () => {
  const company = target("Salesforce");
  company.domain = "salesforce.com";
  company.roleKeywords = ["intern", "new grad", "early career"];
  const jobs = extractSalesforceJobs({ Report_Entry: [{
    Job_Posting_Title: "Software Engineering AMTS (College Grad)", Job_Requisition_Ref_ID: "JR355250",
    External_Job_Posting_Site: "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/x/JR355250",
    Job_Description: "<p>Build cloud products.</p>", Job_Requisition_Primary_Location: "California - San Francisco",
    Countries: ["United States"], Regions: ["California"], Locations: ["San Francisco"], Employee_Type: "New Grads",
  }] }, source, company, observedAt);
  assert.equal(isSalesforce(company), true);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].locations, ["San Francisco, California, United States"]);
  assert.equal(jobs[0].employmentType, "NEW_GRAD");
});

test("extracts Google undergraduate early-career cards and rejects PhD-only roles", () => {
  const company = target("Google");
  company.domain = "google.com";
  const html = `<div class="ObfsIf-eEDwDf"><h3 class="QJPWVe">Software Engineering Intern, BS, Summer 2027</h3><span class="r0wTof">Mountain View, CA, USA</span><a href="jobs/results/123-software-engineering-intern-bs-summer-2027">Learn more</a></div>
    <div class="ObfsIf-eEDwDf"><h3 class="QJPWVe">Research Intern, PhD, Summer 2027</h3><span class="r0wTof">New York, NY, USA</span><a href="jobs/results/456-research-intern-phd-summer-2027">Learn more</a></div>`;
  const jobs = extractGoogleCareersJobs(html, source, company, observedAt);
  assert.equal(isGoogleCareers(company), true);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Software Engineering Intern, BS, Summer 2027");
  assert.deepEqual(jobs[0].locations, ["Mountain View, CA, USA"]);
});
