import { load } from "cheerio";
import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type JibeLocation = { city?: string; state?: string; country?: string; country_code?: string; location_name?: string };
type JibeJobData = JibeLocation & {
  slug?: string; req_id?: string; title?: string; description?: string; apply_url?: string;
  canonical_url?: string; full_location?: string; short_location?: string; additional_locations?: JibeLocation[];
};
type JibeResponse = { jobs?: Array<{ data?: JibeJobData }>; totalCount?: number; count?: number };
type JibeConfig = { apiOrigin: string; filters?: Record<string, string> };

const configs = new Map<string, JibeConfig>([
  ["amd", { apiOrigin: "https://careers.amd.com", filters: { categories: "Student / Intern / Temp", country: "United States" } }],
  ["arm", { apiOrigin: "https://careers.arm.com" }],
  ["booking.com", { apiOrigin: "https://careers.booking.com" }],
  ["github", { apiOrigin: "https://www.github.careers" }],
  ["sig", { apiOrigin: "https://careers.sig.com" }],
]);

export function jibeConfig(target: TargetCompany): JibeConfig | null {
  return configs.get(target.name.trim().toLowerCase()) ?? null;
}

function description(value = ""): string {
  return load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

function formatLocation(value: JibeLocation): string {
  return [value.city, value.state, value.country_code || value.country].filter(Boolean).join(", ") || value.location_name?.trim() || "";
}

export function extractJibeJobs(
  payload: JibeResponse,
  apiOrigin: string,
  source: TargetSource,
  target: TargetCompany,
  observedAt: string,
): JobPosting[] {
  if (!Array.isArray(payload.jobs)) throw new Error("Jibe API returned an invalid response.");
  return payload.jobs.flatMap(({ data }) => {
    if (!data) return [];
    const title = data.title?.trim() ?? "";
    const path = data.canonical_url || (data.slug || data.req_id ? `/jobs/${data.slug || data.req_id}` : "");
    if (!title || !path) return [];
    const canonicalUrl = new URL(path, apiOrigin).toString();
    const jobDescription = description(data.description);
    if (!matchesTarget({ title, description: jobDescription }, target)) return [];
    const jobLocations = [formatLocation(data), ...(data.additional_locations ?? []).map(formatLocation), data.full_location ?? ""]
      .map((value) => value.trim()).filter(Boolean);
    const uniqueLocations = [...new Set(jobLocations)];
    const applicationUrl = data.apply_url ? new URL(data.apply_url, apiOrigin).toString() : canonicalUrl;
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl, title, description: jobDescription, locations: uniqueLocations,
      employmentType: employmentType(title), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, jobDescription, canonicalUrl, uniqueLocations.join("|")), extractionConfidence: 0.99,
    }];
  });
}

export async function discoverJibeJobs(
  source: TargetSource,
  target: TargetCompany,
  observedAt: string,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<JobPosting[]> {
  const config = jibeConfig(target);
  if (!config) return [];
  const jobs: JobPosting[] = [];
  let page = 1;
  let total = 0;
  do {
    const params = new URLSearchParams({ ...config.filters, page: String(page) });
    const payload = await fetchJson(`${config.apiOrigin}/api/jobs?${params}`) as JibeResponse;
    const records = payload.jobs ?? [];
    jobs.push(...extractJibeJobs(payload, config.apiOrigin, source, target, observedAt));
    total = payload.totalCount ?? payload.count ?? records.length;
    page += 1;
    if (!records.length) break;
  } while ((page - 1) * 10 < total && page <= 50);
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}
