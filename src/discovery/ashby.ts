import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type AshbyJob = {
  title?: string; location?: string; secondaryLocations?: Array<{ location?: string }>;
  descriptionPlain?: string; jobUrl?: string; applyUrl?: string; department?: string; employmentType?: string;
};
type AshbyResponse = { jobs?: AshbyJob[] };

const boards = new Map(Object.entries({
  crusoe: "crusoe", docker: "docker", lambda: "lambda", notion: "notion", ramp: "ramp", sentry: "sentry",
}));

export function ashbyBoard(target: TargetCompany): string | null {
  return boards.get(target.name.trim().toLowerCase()) ?? null;
}

export function extractAshbyJobs(payload: AshbyResponse, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  if (!Array.isArray(payload.jobs)) throw new Error("Ashby API returned an invalid response.");
  return payload.jobs.flatMap((record) => {
    const title = record.title?.trim() ?? "";
    const canonicalUrl = record.jobUrl?.trim() ?? "";
    const description = record.descriptionPlain?.trim() ?? "";
    if (!title || !canonicalUrl || !matchesTarget({ title, description }, target)) return [];
    const locations = [...new Set([record.location, ...(record.secondaryLocations ?? []).map(({ location }) => location)]
      .filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: record.applyUrl?.trim() || canonicalUrl, title, description,
      locations, employmentType: employmentType(title, `${record.employmentType ?? ""} ${record.department ?? ""}`),
      firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")), extractionConfidence: 0.99,
    }];
  });
}

export async function discoverAshbyJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: (url: string) => Promise<unknown>) {
  const board = ashbyBoard(target);
  if (!board) return [];
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`);
  return extractAshbyJobs(payload as AshbyResponse, source, target, observedAt);
}
