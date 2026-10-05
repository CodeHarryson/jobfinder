import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";
import type { PublicJsonFetcher } from "./scan-targets.ts";

type RipplingLocation = { name?: string; country?: string; countryCode?: string };
type RipplingHit = {
  name?: string;
  url?: string;
  departmentName?: string;
  locationNames?: string[];
  locations?: RipplingLocation[];
};
type RipplingResponse = { hits?: RipplingHit[] };

const ALGOLIA_APPLICATION_ID = "6FNAX3TBEF";
const ALGOLIA_SEARCH_KEY = "416caa4690f002ff6fe4a2097623640b";
const ALGOLIA_INDEX = "careers_en-US_production";

export function isRippling(target: TargetCompany) {
  return target.name.trim().toLowerCase() === "rippling" || target.domain === "rippling.com";
}

export function extractRipplingJobs(payloads: RipplingResponse[], source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  const jobs = new Map<string, JobPosting>();
  for (const payload of payloads) {
    if (!Array.isArray(payload.hits)) throw new Error("Rippling careers search returned an invalid response.");
    for (const hit of payload.hits) {
      const title = hit.name?.trim() ?? "";
      const canonicalUrl = hit.url?.trim().split("?")[0] ?? "";
      const description = hit.departmentName?.trim() ?? "";
      if (!title || !/^https:\/\/ats\.rippling\.com\/rippling\/jobs\/[0-9a-f-]+$/i.test(canonicalUrl)) continue;
      if (!matchesTarget({ title, description }, target)) continue;
      const locations = [...new Set([
        ...(hit.locationNames ?? []),
        ...(hit.locations ?? []).flatMap((location) => location.name ? [location.name] : []),
      ].map((location) => location.trim()).filter(Boolean))];
      const existing = jobs.get(canonicalUrl);
      if (existing) {
        existing.locations = [...new Set([...existing.locations, ...locations])];
        existing.contentFingerprint = fingerprint(existing.title, existing.description, canonicalUrl, existing.locations.join("|"));
        continue;
      }
      jobs.set(canonicalUrl, {
        kind: "JOB", id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
        sourceUrl: source.url, canonicalUrl, applicationUrl: canonicalUrl, title, description, locations,
        employmentType: employmentType(title, description), firstSeenAt: observedAt, lastSeenAt: observedAt,
        contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")), extractionConfidence: 0.99,
      });
    }
  }
  return [...jobs.values()];
}

export async function discoverRipplingJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: PublicJsonFetcher) {
  const endpoint = `https://${ALGOLIA_APPLICATION_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
  const payloads = await Promise.all(discoveryQueries(target).map((query) => fetchJson(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-algolia-application-id": ALGOLIA_APPLICATION_ID,
      "x-algolia-api-key": ALGOLIA_SEARCH_KEY,
    },
    body: JSON.stringify({ params: new URLSearchParams({ query, hitsPerPage: "100", analytics: "false" }).toString() }),
  }) as Promise<RipplingResponse>));
  return extractRipplingJobs(payloads, source, target, observedAt);
}
