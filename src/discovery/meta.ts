import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { discoveryQueries, employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";
import type { PublicTextFetcher } from "./scan-targets.ts";

type MetaJob = { id?: string; title?: string; locations?: string[]; teams?: string[]; sub_teams?: string[] };
type MetaSearchResponse = {
  data?: { job_search_with_featured_jobs?: { all_jobs?: MetaJob[] | null; featured_jobs?: MetaJob[] | null } | null };
  errors?: Array<{ message?: string }>;
};

const JOBS_PAGE = "https://www.metacareers.com/jobs/";
const GRAPHQL_ENDPOINT = "https://www.metacareers.com/graphql";
const FRIENDLY_NAME = "CareersJobSearchResultsDataQuery";
// Relay persisted-query id for the job search. Meta rotates these, so it is only
// a starting guess: a rejected query re-reads the id from the live page bundles.
const FALLBACK_DOC_ID = "27506805582236862";

// metacareers.com answers a self-identifying crawler with HTTP 502 and rejects a
// GraphQL POST that lacks the browser fetch metadata, so both requests present a
// full browser header set.
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export function isMeta(target: TargetCompany) {
  return target.name.trim().toLowerCase() === "meta" || target.domain === "metacareers.com";
}

export function metaJobUrl(id: string) {
  return `https://www.metacareers.com/jobs/${id}/`;
}

export function parseMetaPageTokens(html: string): { lsd: string; scriptUrls: string[] } {
  const lsd = /"LSD",\[\],\{"token":"([^"]+)"/.exec(html)?.[1] ?? "";
  if (!lsd) throw new Error("Meta careers page did not expose an LSD token.");
  return { lsd, scriptUrls: [...new Set(html.match(/https:\/\/[a-z0-9.-]+\.fbcdn\.net\/[^"']+\.js/g) ?? [])] };
}

export function parseMetaDocId(script: string): string | null {
  return /__d\("CareersJobSearchResultsDataQuery_candidate_portalRelayOperation".*?exports\s*=\s*"(\d+)"/s.exec(script)?.[1] ?? null;
}

export function extractMetaJobs(payloads: MetaSearchResponse[], source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  const jobs = new Map<string, JobPosting>();
  for (const payload of payloads) {
    const result = payload.data?.job_search_with_featured_jobs;
    if (!result) throw new Error(payload.errors?.[0]?.message ?? "Meta careers search returned an invalid response.");
    for (const job of [...(result.featured_jobs ?? []), ...(result.all_jobs ?? [])]) {
      const id = job.id?.trim() ?? "";
      const title = job.title?.trim() ?? "";
      if (!title || !/^\d+$/.test(id)) continue;
      // Teams carry the programme label ("Internship - Engineering, Tech & Design"),
      // which is what distinguishes an intern posting from a senior one of the same name.
      const description = [...(job.teams ?? []), ...(job.sub_teams ?? [])].map((team) => team.trim()).filter(Boolean).join(", ");
      if (!matchesTarget({ title, description }, target)) continue;
      const canonicalUrl = metaJobUrl(id);
      if (jobs.has(canonicalUrl)) continue;
      const locations = [...new Set((job.locations ?? []).map((location) => location.trim()).filter(Boolean))];
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

function browserHeaders(lsd: string): Record<string, string> {
  return {
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": BROWSER_USER_AGENT,
    "accept-language": "en-US,en;q=0.9",
    "x-fb-lsd": lsd,
    "x-fb-friendly-name": FRIENDLY_NAME,
    origin: "https://www.metacareers.com",
    referer: JOBS_PAGE,
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "sec-fetch-dest": "empty",
  };
}

function searchBody(lsd: string, docId: string, query: string): string {
  return new URLSearchParams({
    lsd,
    __a: "1",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: FRIENDLY_NAME,
    doc_id: docId,
    variables: JSON.stringify({ search_input: { q: query }, isLoggedIn: false, viewasUserID: null }),
  }).toString();
}

async function resolveDocId(scriptUrls: string[], fetchText: PublicTextFetcher): Promise<string | null> {
  for (const scriptUrl of scriptUrls) {
    const docId = parseMetaDocId(await fetchText(scriptUrl, { headers: { "user-agent": BROWSER_USER_AGENT } }).catch(() => ""));
    if (docId) return docId;
  }
  return null;
}

export async function discoverMetaJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchText: PublicTextFetcher) {
  // The GraphQL endpoint answers with content-type text/html, so the response is
  // read as text and parsed here rather than through the JSON fetcher.
  const { lsd, scriptUrls } = parseMetaPageTokens(await fetchText(JOBS_PAGE, {
    headers: {
      "user-agent": BROWSER_USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-dest": "document",
      "upgrade-insecure-requests": "1",
    },
  }));

  const search = async (docId: string, query: string) => {
    const body = await fetchText(GRAPHQL_ENDPOINT, { method: "POST", headers: browserHeaders(lsd), body: searchBody(lsd, docId, query) });
    const payload = JSON.parse(body) as MetaSearchResponse;
    if (!payload.data?.job_search_with_featured_jobs) throw new Error(payload.errors?.[0]?.message ?? "Meta careers search returned no result set.");
    return payload;
  };

  const queries = discoveryQueries(target);
  let docId = FALLBACK_DOC_ID;
  let payloads: MetaSearchResponse[];
  try {
    payloads = [await search(docId, queries[0])];
  } catch (firstError) {
    // A rotated persisted-query id fails every search, so re-read it from the
    // page bundles once before giving up.
    const scraped = await resolveDocId(scriptUrls, fetchText);
    if (!scraped || scraped === docId) {
      throw new Error(`Meta careers search failed: ${firstError instanceof Error ? firstError.message : "unknown error"}`);
    }
    docId = scraped;
    payloads = [await search(docId, queries[0])];
  }

  const rest = await Promise.allSettled(queries.slice(1).map((query) => search(docId, query)));
  payloads.push(...rest.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
  return extractMetaJobs(payloads, source, target, observedAt);
}
