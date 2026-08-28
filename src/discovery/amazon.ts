import { load } from "cheerio";
import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type AmazonJob = {
  title?: string; description?: string; basic_qualifications?: string; preferred_qualifications?: string;
  job_path?: string; url_next_step?: string; normalized_location?: string; location?: string; locations?: string[];
  job_schedule_type?: string;
};
type AmazonResponse = { hits?: number; jobs?: AmazonJob[] };

export function isAmazon(target: TargetCompany) { return target.name.trim().toLowerCase() === "amazon" || target.domain === "amazon.jobs"; }

function plainText(value = "") { return load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim(); }

function locations(record: AmazonJob) {
  const parsed = (record.locations ?? []).flatMap((value) => {
    try {
      const location = JSON.parse(value) as { normalizedLocation?: string; location?: string };
      return [location.normalizedLocation || location.location || ""].filter(Boolean);
    } catch { return [value]; }
  });
  return [...new Set([...parsed, record.normalized_location ?? "", record.location ?? ""].map((value) => value.trim()).filter(Boolean))];
}

export function extractAmazonJobs(payload: AmazonResponse, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  if (!Array.isArray(payload.jobs)) throw new Error("Amazon Jobs API returned an invalid response.");
  return payload.jobs.flatMap((record) => {
    const title = record.title?.trim() ?? "";
    const canonicalUrl = record.job_path ? new URL(record.job_path, "https://www.amazon.jobs").toString() : "";
    const description = plainText([record.description, record.basic_qualifications, record.preferred_qualifications].filter(Boolean).join(" "));
    if (!title || !canonicalUrl || !matchesTarget({ title, description }, target)) return [];
    const jobLocations = locations(record);
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: record.url_next_step?.trim() || canonicalUrl,
      title, description, locations: jobLocations, employmentType: employmentType(title, record.job_schedule_type),
      firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, jobLocations.join("|")), extractionConfidence: 0.99,
    }];
  });
}

export async function discoverAmazonJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: (url: string) => Promise<unknown>) {
  const jobs: JobPosting[] = [];
  for (const query of discoveryQueries(target)) {
    let offset = 0;
    let hits = 0;
    do {
      const params = new URLSearchParams({ base_query: query, offset: String(offset), result_limit: "100", sort: "recent" });
      const payload = await fetchJson(`https://www.amazon.jobs/en/search.json?${params}`) as AmazonResponse;
      jobs.push(...extractAmazonJobs(payload, source, target, observedAt));
      hits = Number(payload.hits ?? 0);
      offset += payload.jobs?.length ?? 0;
      if (!payload.jobs?.length) break;
    } while (offset < hits && offset < 500);
  }
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}

