import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";
import type { PublicJsonFetcher } from "./scan-targets.ts";

type PhenomConfig = { origin: string; lang: string; country: string };
type PhenomJob = {
  title?: string; jobId?: string; jobUrl?: string; applyUrl?: string; location?: string;
  city?: string; state?: string; country?: string; description?: string; category?: string;
};
type PhenomResponse = { refineSearch?: { data?: { jobs?: PhenomJob[]; totalHits?: number } } };

const configs = new Map<string, PhenomConfig>([
  ["cisco", { origin: "https://careers.cisco.com", lang: "en_global", country: "global" }],
  ["ebay", { origin: "https://jobs.ebayinc.com", lang: "en_us", country: "us" }],
  ["hpe", { origin: "https://careers.hpe.com", lang: "en_us", country: "us" }],
  ["snowflake", { origin: "https://careers.snowflake.com", lang: "en_us", country: "us" }],
]);

export function phenomConfig(target: TargetCompany): PhenomConfig | null {
  return configs.get(target.name.trim().toLowerCase()) ?? null;
}

function records(payload: PhenomResponse): { jobs: PhenomJob[]; total: number } {
  const data = payload.refineSearch?.data;
  if (!Array.isArray(data?.jobs)) throw new Error("Phenom API returned an invalid response.");
  return { jobs: data.jobs, total: data.totalHits ?? data.jobs.length };
}

export function extractPhenomJobs(payload: PhenomResponse, config: PhenomConfig, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  return records(payload).jobs.flatMap((record) => {
    const title = record.title?.trim() ?? "";
    const path = record.jobUrl || (record.jobId ? `/global/en/job/${record.jobId}` : "");
    if (!title || !path) return [];
    const canonicalUrl = new URL(path, config.origin).toString();
    const description = record.description?.trim() ?? "";
    if (!matchesTarget({ title, description }, target)) return [];
    const structured = [record.city, record.state, record.country].filter(Boolean).join(", ");
    const locations = [...new Set([record.location, structured].filter((value): value is string => Boolean(value?.trim())))];
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: record.applyUrl ? new URL(record.applyUrl, config.origin).toString() : canonicalUrl,
      title, description, locations, employmentType: employmentType(title, record.category), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")), extractionConfidence: 0.96,
    }];
  });
}

export async function discoverPhenomJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: PublicJsonFetcher) {
  const config = phenomConfig(target);
  if (!config) return [];
  const jobs: JobPosting[] = [];
  for (const keyword of discoveryQueries(target)) {
    let from = 0;
    let total = 0;
    do {
      const body = { lang: config.lang, deviceType: "desktop", country: config.country, pageName: "search-results",
        ddoKey: "refineSearch", sortBy: "", subsearch: "", from, jobs: true, counts: true,
        all_fields: ["category", "country", "state", "city"], size: 10, clearAll: false, jdsource: "facets", keywords: keyword };
      const payload = await fetchJson(`${config.origin}/widgets`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }) as PhenomResponse;
      const page = records(payload);
      jobs.push(...extractPhenomJobs(payload, config, source, target, observedAt));
      total = page.total;
      from += page.jobs.length;
      if (!page.jobs.length) break;
    } while (from < total && from < 500);
  }
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}
