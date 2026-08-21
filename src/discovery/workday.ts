import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";
import type { PublicJsonFetcher } from "./scan-targets.ts";

type WorkdayConfig = { origin: string; tenant: string; site: string };
type WorkdayPosting = { title?: string; externalPath?: string; locationsText?: string; bulletFields?: string[] };
type WorkdayResponse = { total?: number; jobPostings?: WorkdayPosting[] };

const configs = new Map<string, WorkdayConfig>([
  ["adobe", { origin: "https://adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" }],
  ["autodesk", { origin: "https://autodesk.wd1.myworkdayjobs.com", tenant: "autodesk", site: "Ext" }],
  ["expedia", { origin: "https://expedia.wd108.myworkdayjobs.com", tenant: "expedia", site: "search" }],
  ["intel", { origin: "https://intel.wd1.myworkdayjobs.com", tenant: "intel", site: "External" }],
  ["mastercard", { origin: "https://mastercard.wd1.myworkdayjobs.com", tenant: "mastercard", site: "CorporateCareers" }],
  ["workday", { origin: "https://workday.wd5.myworkdayjobs.com", tenant: "workday", site: "Workday" }],
]);

export function workdayConfig(target: TargetCompany): WorkdayConfig | null {
  return configs.get(target.name.trim().toLowerCase()) ?? null;
}

export function extractWorkdayJobs(payload: WorkdayResponse, config: WorkdayConfig, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  if (!Array.isArray(payload.jobPostings)) throw new Error("Workday API returned an invalid response.");
  return payload.jobPostings.flatMap((record) => {
    const title = record.title?.trim() ?? "";
    if (!title || !record.externalPath) return [];
    const canonicalUrl = new URL(record.externalPath, `${config.origin}/en-US/${config.site}`).toString();
    const description = (record.bulletFields ?? []).join(" ").trim();
    if (!matchesTarget({ title, description }, target)) return [];
    const locations = (record.locationsText ?? "").split(/\s*\|\s*|;\s*/).filter(Boolean);
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: canonicalUrl, title, description, locations,
      employmentType: employmentType(title), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")), extractionConfidence: 0.97,
    }];
  });
}

export async function discoverWorkdayJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: PublicJsonFetcher) {
  const config = workdayConfig(target);
  if (!config) return [];
  const endpoint = `${config.origin}/wday/cxs/${config.tenant}/${config.site}/jobs`;
  const jobs: JobPosting[] = [];
  for (const searchText of discoveryQueries(target)) {
    let offset = 0;
    let total = 0;
    do {
      const payload = await fetchJson(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
      }) as WorkdayResponse;
      const records = payload.jobPostings ?? [];
      jobs.push(...extractWorkdayJobs(payload, config, source, target, observedAt));
      total = payload.total ?? records.length;
      offset += records.length;
      if (!records.length) break;
    } while (offset < total && offset < 500);
  }
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}
