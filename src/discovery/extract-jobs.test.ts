import assert from "node:assert/strict";
import test from "node:test";
import { extractJobs } from "./extract-jobs.ts";
import { isUnitedStatesJob, scanTargets } from "./scan-targets.ts";
import type { TargetCompany } from "../domain/opportunity.ts";

const target: TargetCompany = {
  id: "notion", name: "Notion", domain: "notion.so", priority: "HIGH",
  roleKeywords: ["intern", "new grad"], eventKeywords: [], createdAt: "2026-01-01T00:00:00.000Z",
  sources: [{ id: "notion-careers", kind: "CAREERS", url: "https://notion.so/careers", enabled: true, scanCron: "* * * * *" }],
};

const html = `<!doctype html><html><body>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Software Engineering Intern","description":"<p>Build collaborative tools.</p>","employmentType":"INTERN","url":"https://jobs.example/notion/intern?utm_source=test","jobLocation":{"address":{"addressLocality":"San Francisco","addressRegion":"CA","addressCountry":"US"}}}</script>
  <a href="/careers/senior-accountant">Senior Accountant</a>
  <a href="https://jobs.example/notion/new-grad">New Grad Software Engineer</a>
  <script>self.__next_f.push([1,"[0,\"title\"],[0,\"Product Engineering Intern\"],[0,\"href\"],[0,\"https://jobs.example/notion/product-intern\"]"])</script>
</body></html>`;

test("extracts, filters, canonicalizes, and deduplicates structured and linked jobs", () => {
  const jobs = extractJobs(html, target.sources[0], target, "2026-08-14T00:00:00.000Z");
  assert.equal(jobs.length, 3);
  assert.equal(jobs[0].title, "Software Engineering Intern");
  assert.equal(jobs[0].canonicalUrl, "https://jobs.example/notion/intern");
  assert.deepEqual(jobs[0].locations, ["San Francisco, CA, US"]);
  assert.equal(jobs.some(({ title }) => title === "Senior Accountant"), false);
});

test("continues scanning other sources when one source fails", async () => {
  const secondTarget = { ...target, id: "second", sources: [{ ...target.sources[0], id: "second-source", url: "https://example.test/jobs" }] };
  const result = await scanTargets([target, secondTarget], async (url) => {
    if (url.includes("notion.so")) throw new Error("HTTP 403");
    return html;
  });
  assert.equal(result.failures.length, 1);
  assert.equal(result.jobs.length, 1);
});

test("keeps explicitly US-located jobs and rejects international or unknown locations", () => {
  assert.equal(isUnitedStatesJob({ locations: ["Redmond, WA, US"] }), true);
  assert.equal(isUnitedStatesJob({ locations: ["United States, California, Mountain View"] }), true);
  assert.equal(isUnitedStatesJob({ locations: ["Bengaluru, KA, IN"] }), false);
  assert.equal(isUnitedStatesJob({ locations: ["Remote"] }), false);
  assert.equal(isUnitedStatesJob({ locations: [] }), false);
});

test("rejects substring, recruiting, navigation, media, and search false positives", () => {
  const noisy = `<!doctype html><html><body>
    <a href="https://job-boards.greenhouse.io/acme/jobs/123456">Director, US International Tax</a>
    <a href="https://job-boards.greenhouse.io/acme/jobs/123457">Internal Communications Manager</a>
    <a href="https://jobs.ashbyhq.com/acme/12345678-1234-1234-1234-123456789abc">Technical Recruiter, Early Career</a>
    <a href="https://example.com/career-programs/university">Explore internships</a>
    <a href="https://example.com/intern-film.mp4">Watch the film about becoming an intern</a>
    <a href="https://job-boards.greenhouse.io/acme/jobs/123458">Software Engineer Intern</a>
  </body></html>`;
  const jobs = extractJobs(noisy, target.sources[0], target, "2026-08-18T00:00:00.000Z");
  assert.deepEqual(jobs.map(({ title }) => title), ["Software Engineer Intern"]);
});
