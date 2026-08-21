import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type LeverJob = {
  id?: string; text?: string; descriptionPlain?: string; additionalPlain?: string;
  hostedUrl?: string; applyUrl?: string; categories?: { location?: string; department?: string; commitment?: string };
};

const sites = new Map(Object.entries({
  "belvedere trading": "belvederetrading", palantir: "palantir", spotify: "spotify",
}));

export function leverSite(target: TargetCompany): string | null {
  return sites.get(target.name.trim().toLowerCase()) ?? null;
}

export function extractLeverJobs(payload: unknown, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  if (!Array.isArray(payload)) throw new Error("Lever API returned an invalid response.");
  return (payload as LeverJob[]).flatMap((record) => {
    const title = record.text?.trim() ?? "";
    const canonicalUrl = record.hostedUrl?.trim() ?? "";
    const description = [record.descriptionPlain, record.additionalPlain].filter(Boolean).join(" ").trim();
    if (!title || !canonicalUrl || !matchesTarget({ title, description }, target)) return [];
    const locations = (record.categories?.location ?? "").split(/[;|]/).map((value) => value.trim()).filter(Boolean);
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: record.applyUrl?.trim() || canonicalUrl, title, description,
      locations, employmentType: employmentType(title, record.categories?.commitment), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")), extractionConfidence: 0.99,
    }];
  });
}

export async function discoverLeverJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: (url: string) => Promise<unknown>) {
  const site = leverSite(target);
  if (!site) return [];
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
  return extractLeverJobs(payload, source, target, observedAt);
}
