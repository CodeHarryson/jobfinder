import { load } from "cheerio";
import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

export function isGoogleCareers(target: TargetCompany) { return target.name.trim().toLowerCase() === "google" || target.domain === "google.com"; }

export function extractGoogleCareersJobs(html: string, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  const $ = load(html);
  const jobs: JobPosting[] = [];
  $('a[href*="jobs/results/"]').each((_, link) => {
    const card = $(link).closest(".ObfsIf-eEDwDf");
    const title = (card.find("h3.QJPWVe").first().text() || $(link).attr("aria-label")?.replace(/^Learn more about\s+/i, "") || "").trim();
    const href = $(link).attr("href") ?? "";
    if (!title || !/jobs\/results\/\d+-/.test(href)) return;
    const canonicalUrl = new URL(href.split("?")[0], "https://www.google.com/about/careers/applications/").toString();
    const description = card.text().replace(/\s+/g, " ").trim();
    if (!matchesTarget({ title, description }, target)) return;
    const jobLocations = [...new Set(card.find(".r0wTof").map((_, element) => $(element).text().trim()).get().filter(Boolean))];
    jobs.push({
      kind: "JOB", id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: canonicalUrl, title, description, locations: jobLocations,
      employmentType: employmentType(title), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, jobLocations.join("|")), extractionConfidence: 0.96,
    });
  });
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}

export async function discoverGoogleCareersJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchPage: (url: string) => Promise<string>) {
  const jobs: JobPosting[] = [];
  for (const query of discoveryQueries(target)) {
    const params = new URLSearchParams({ q: query, location: "United States" });
    const html = await fetchPage(`https://www.google.com/about/careers/applications/jobs/results/?${params}`);
    jobs.push(...extractGoogleCareersJobs(html, source, target, observedAt));
  }
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}

