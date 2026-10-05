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
import { discoverGoogleCareersJobs, extractGoogleCareersJobs, isGoogleCareers } from "./google-careers.ts";
import { extractGreenhouseJobs, greenhouseBoard } from "./greenhouse.ts";
import { extractRipplingJobs, isRippling } from "./rippling.ts";
import { discoverMetaJobs, extractMetaJobs, isMeta, parseMetaDocId, parseMetaPageTokens } from "./meta.ts";

const source: TargetSource = { id: "source", kind: "CAREERS", url: "https://example.com/careers", enabled: true, scanCron: "* * * * *" };
const target = (name: string): TargetCompany => ({
  id: name.toLowerCase(), name, domain: "example.com", priority: "HIGH", roleKeywords: ["intern"], eventKeywords: [],
  sources: [source], createdAt: "2026-08-20T00:00:00.000Z",
});
const observedAt = "2026-08-20T12:00:00.000Z";

test("maps HP IQ to Greenhouse and gives Stripe a working direct application URL", () => {
  assert.equal(greenhouseBoard(target("HP IQ")), "hpiq");
  const jobs = extractGreenhouseJobs({ jobs: [{ id: 8128745, title: "Software Engineer, Intern (Summer or Winter)",
    absolute_url: "https://stripe.com/jobs/search?gh_jid=8128745", content: "Build financial infrastructure.",
    location: { name: "San Francisco, CA" } }] }, source, target("Stripe"), observedAt);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].canonicalUrl, "https://stripe.com/jobs/search?gh_jid=8128745");
  assert.equal(jobs[0].applicationUrl, "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8128745");
});

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

test("extracts Google's US Summer 2027 BS internship card and rejects PhD-only roles", () => {
  const company = target("Google");
  company.domain = "google.com";
  const html = `<div class="ObfsIf-eEDwDf"><h3 class="QJPWVe">Software Engineering Intern, BS, Summer 2027</h3><span class="r0wTof">Mountain View, CA, USA</span><span class="r0wTof">Atlanta, GA, USA</span><a href="jobs/results/85564713261245126-software-engineering-intern-bs-summer-2027?target_level=INTERN_AND_APPRENTICE">Learn more</a></div>
    <div class="ObfsIf-eEDwDf"><h3 class="QJPWVe">Research Intern, PhD, Summer 2027</h3><span class="r0wTof">New York, NY, USA</span><a href="jobs/results/456-research-intern-phd-summer-2027">Learn more</a></div>`;
  const jobs = extractGoogleCareersJobs(html, source, company, observedAt);
  assert.equal(isGoogleCareers(company), true);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Software Engineering Intern, BS, Summer 2027");
  assert.deepEqual(jobs[0].locations, ["Mountain View, CA, USA", "Atlanta, GA, USA"]);
  assert.equal(jobs[0].canonicalUrl, "https://www.google.com/about/careers/applications/jobs/results/85564713261245126-software-engineering-intern-bs-summer-2027");
});

test("queries Google university-graduate roles in parallel and tolerates one failed query", async () => {
  const company = target("Google");
  company.domain = "google.com";
  company.roleKeywords = ["intern", "new grad", "graduate"];
  const requested: string[] = [];
  const jobs = await discoverGoogleCareersJobs(source, company, observedAt, async (url) => {
    const query = new URL(url).searchParams.get("q") ?? "";
    requested.push(query);
    if (query === "new grad") throw new Error("timed out");
    if (query !== "university graduate") return "<html></html>";
    return `<div><h3 class="QJPWVe">Associate Product Manager, University Graduate, 2027 Start</h3><span class="r0wTof">Mountain View, CA, USA</span><a href="jobs/results/123-associate-product-manager-university-graduate-2027-start">Learn more</a></div>`;
  });
  assert.deepEqual(new Set(requested), new Set(["intern", "new grad", "university graduate"]));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].employmentType, "NEW_GRAD");
});

test("normalizes Rippling's public careers index and merges location records", () => {
  const company = target("Rippling");
  company.domain = "rippling.com";
  const url = "https://ats.rippling.com/rippling/jobs/a07e4e46-3721-4934-b57b-0d58412e22ba";
  const jobs = extractRipplingJobs([{ hits: [
    { name: "Software Engineer Intern - Backend Focused - Summer 2027", url, departmentName: "Engineering", locationNames: ["Seattle, WA"] },
    { name: "Software Engineer Intern - Backend Focused - Summer 2027", url, departmentName: "Engineering", locations: [{ name: "San Francisco, CA", countryCode: "US" }] },
  ] }], source, company, observedAt);
  assert.equal(isRippling(company), true);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].locations, ["Seattle, WA", "San Francisco, CA"]);
  assert.equal(jobs[0].employmentType, "INTERNSHIP");
});

test("recognizes Meta by name and domain", () => {
  assert.equal(isMeta(target("Meta")), true);
  assert.equal(isMeta({ ...target("Anything"), domain: "metacareers.com" }), true);
  assert.equal(isMeta(target("Netflix")), false);
});

test("normalizes Meta job search results and keeps only early-career titles", () => {
  const jobs = extractMetaJobs([{ data: { job_search_with_featured_jobs: {
    featured_jobs: [{ id: "1613359540444032", title: "Product Design Engineering Intern", locations: ["Redmond, WA"],
      teams: ["Facebook Reality Labs"], sub_teams: ["Hardware"] }],
    all_jobs: [
      { id: "1095054769939445", title: "DFX Engineering Intern", locations: ["Sunnyvale, CA", "Seattle, WA"],
        teams: ["AR/VR", "Internship - Engineering, Tech & Design"], sub_teams: ["Hardware"] },
      { id: "999", title: "Principal, Strategic Data Center Partnerships", locations: ["Menlo Park, CA"], teams: ["Infra"] },
      { id: "not-numeric", title: "Software Engineer Intern", locations: ["Menlo Park, CA"] },
    ],
  } } }], source, target("Meta"), observedAt);
  assert.deepEqual(jobs.map((job) => job.title), ["Product Design Engineering Intern", "DFX Engineering Intern"]);
  assert.equal(jobs[1].canonicalUrl, "https://www.metacareers.com/jobs/1095054769939445/");
  assert.equal(jobs[1].applicationUrl, "https://www.metacareers.com/jobs/1095054769939445/");
  assert.deepEqual(jobs[1].locations, ["Sunnyvale, CA", "Seattle, WA"]);
  assert.equal(jobs[1].employmentType, "INTERNSHIP");
  assert.equal(jobs.every((job) => isUnitedStatesJob(job)), true);
});

test("surfaces a Meta GraphQL error instead of reporting an empty scan", () => {
  assert.throws(() => extractMetaJobs([{ errors: [{ message: "Persisted query not found" }] }], source, target("Meta"), observedAt),
    /Persisted query not found/);
});

test("reads the LSD token and bundle URLs from the Meta careers page", () => {
  const html = `<script>require("ServerJS").handle({"define":[["LSD",[],{"token":"AdSzR9FcUvh"},1]]});</script>`
    + `<script src="https://static.xx.fbcdn.net/rsrc.php/v4/yd/r/FfSDR6BW-8Z.js"></script>`;
  assert.deepEqual(parseMetaPageTokens(html), { lsd: "AdSzR9FcUvh", scriptUrls: ["https://static.xx.fbcdn.net/rsrc.php/v4/yd/r/FfSDR6BW-8Z.js"] });
  assert.throws(() => parseMetaPageTokens("<html></html>"), /LSD token/);
});

test("recovers a rotated Meta persisted-query id from the page bundles", async () => {
  const page = `<script>{"define":[["LSD",[],{"token":"tok"},1]]}</script>`
    + `<script src="https://static.xx.fbcdn.net/rsrc.php/a.js"></script>`;
  const bundle = `__d("CareersJobSearchResultsDataQuery_candidate_portalRelayOperation",[],(function(t,n,r,o,a,i){a.exports="12345678901234567"}),null);`;
  assert.equal(parseMetaDocId(bundle), "12345678901234567");
  const docIds: string[] = [];
  const jobs = await discoverMetaJobs(source, target("Meta"), observedAt, async (url, init) => {
    if (url === "https://www.metacareers.com/jobs/") return page;
    if (url.endsWith(".js")) return bundle;
    const docId = new URLSearchParams(String(init?.body)).get("doc_id") ?? "";
    docIds.push(docId);
    if (docId !== "12345678901234567") return JSON.stringify({ errors: [{ message: "Persisted query not found" }] });
    return JSON.stringify({ data: { job_search_with_featured_jobs: { all_jobs: [
      { id: "42", title: "Software Engineer Intern", locations: ["Menlo Park, CA"], teams: ["Internship - Engineering"] },
    ], featured_jobs: [] } } });
  });
  assert.notEqual(docIds[0], "12345678901234567");
  assert.equal(docIds.at(-1), "12345678901234567");
  assert.deepEqual(jobs.map((job) => job.title), ["Software Engineer Intern"]);
});
