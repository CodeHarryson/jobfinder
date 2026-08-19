import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type EightfoldPosition = {
  id?: number | string;
  name?: string;
  locations?: string[];
  standardizedLocations?: string[];
  department?: string;
  positionUrl?: string;
};

type EightfoldResponse = {
  status?: number;
  data?: { count?: number; positions?: EightfoldPosition[] };
};

type EightfoldConfig = { apiOrigin: string; domain: string };

const configs: Record<string, EightfoldConfig> = {
  "microsoft.com": { apiOrigin: "https://apply.careers.microsoft.com", domain: "microsoft.com" },
  "nvidia.com": { apiOrigin: "https://jobs.nvidia.com", domain: "nvidia.com" },
};

export function eightfoldConfig(target: TargetCompany): EightfoldConfig | null {
  return configs[target.domain.toLowerCase()] ?? null;
}

export function extractEightfoldJobs(
  payload: EightfoldResponse,
  apiOrigin: string,
  source: TargetSource,
  target: TargetCompany,
  observedAt: string,
): JobPosting[] {
  return (payload.data?.positions ?? []).flatMap((position) => {
    const title = position.name?.trim() ?? "";
    if (!title || !position.positionUrl) return [];
    const canonicalUrl = new URL(position.positionUrl, apiOrigin).toString();
    const description = position.department?.trim() ?? "";
    if (!matchesTarget({ title, description }, target)) return [];
    const locations = position.standardizedLocations?.length
      ? position.standardizedLocations
      : position.locations ?? [];
    return [{
      kind: "JOB" as const,
      id: idFor(target.id, canonicalUrl),
      companyId: target.id,
      sourceId: source.id,
      sourceUrl: source.url,
      canonicalUrl,
      applicationUrl: canonicalUrl,
      title,
      description,
      locations,
      employmentType: employmentType(title, position.department),
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, locations.join("|")),
      extractionConfidence: 0.98,
    }];
  });
}

export async function discoverEightfoldJobs(
  source: TargetSource,
  target: TargetCompany,
  observedAt: string,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<JobPosting[]> {
  const config = eightfoldConfig(target);
  if (!config) return [];

  const queries = [...new Set(target.roleKeywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];
  const jobs: JobPosting[] = [];
  for (const query of queries) {
    let start = 0;
    let total = 0;
    do {
      const params = new URLSearchParams({ domain: config.domain, query, location: "", start: String(start) });
      const payload = await fetchJson(`${config.apiOrigin}/api/pcsx/search?${params}`) as EightfoldResponse;
      if (payload.status !== 200 || !payload.data) throw new Error("Eightfold listing API returned an invalid response.");
      const positions = payload.data.positions ?? [];
      jobs.push(...extractEightfoldJobs(payload, config.apiOrigin, source, target, observedAt));
      total = payload.data.count ?? positions.length;
      start += positions.length;
      if (!positions.length) break;
    } while (start < total && start < 500);
  }

  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}
