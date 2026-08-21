import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";
import type { PublicJsonFetcher } from "./scan-targets.ts";

type OracleConfig = { origin: string; siteNumber: string; sitePath: string };
type OracleJob = {
  Id?: number | string; Title?: string; ExternalTitle?: string; PrimaryLocation?: string;
  Locations?: string; JobFunction?: string; ShortDescriptionStr?: string; ExternalContactEmail?: string;
};
type OracleResponse = { items?: OracleJob[]; hasMore?: boolean; count?: number };

const configs = new Map<string, OracleConfig>([
  ["dell", { origin: "https://enterpriseplatform.dell.com", siteNumber: "CX_1", sitePath: "careers" }],
]);

export function oracleHcmConfig(target: TargetCompany): OracleConfig | null {
  return configs.get(target.name.trim().toLowerCase()) ?? null;
}

export function extractOracleHcmJobs(payload: OracleResponse, config: OracleConfig, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  if (!Array.isArray(payload.items)) throw new Error("Oracle HCM API returned an invalid response.");
  return payload.items.flatMap((record) => {
    const title = (record.ExternalTitle || record.Title)?.trim() ?? "";
    if (!title || record.Id === undefined) return [];
    const canonicalUrl = `${config.origin}/hcmUI/CandidateExperience/en/sites/${config.sitePath}/job/${encodeURIComponent(String(record.Id))}`;
    const description = record.ShortDescriptionStr?.trim() ?? "";
    if (!matchesTarget({ title, description }, target)) return [];
    const locations = [...new Set([record.PrimaryLocation, record.Locations].filter((value): value is string => Boolean(value?.trim())))];
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: canonicalUrl, title, description, locations,
      employmentType: employmentType(title, record.JobFunction), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")), extractionConfidence: 0.96,
    }];
  });
}

export async function discoverOracleHcmJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: PublicJsonFetcher) {
  const config = oracleHcmConfig(target);
  if (!config) return [];
  const jobs: JobPosting[] = [];
  for (const keyword of discoveryQueries(target)) {
    let offset = 0;
    let hasMore = false;
    do {
      const finder = `findReqs;siteNumber=${config.siteNumber},facetsList=LOCATIONS;WORK_LOCATIONS;TITLES;CATEGORIES,limit=25,offset=${offset},keyword=${keyword}`;
      const params = new URLSearchParams({ onlyData: "true", finder });
      const payload = await fetchJson(`${config.origin}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?${params}`) as OracleResponse;
      jobs.push(...extractOracleHcmJobs(payload, config, source, target, observedAt));
      const count = payload.count ?? payload.items?.length ?? 0;
      offset += count;
      hasMore = Boolean(payload.hasMore) && count > 0 && offset < 500;
    } while (hasMore);
  }
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}
