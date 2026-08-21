import { load } from "cheerio";
import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type GreenhouseLocation = { name?: string };
type GreenhouseJob = {
  id?: number;
  title?: string;
  absolute_url?: string;
  content?: string;
  location?: GreenhouseLocation;
  offices?: Array<{ name?: string; location?: string | GreenhouseLocation }>;
  departments?: Array<{ name?: string }>;
};
type GreenhouseResponse = { jobs?: GreenhouseJob[] };

const boardByCompany = new Map(Object.entries({
  "adyen": "adyen", "affirm": "affirm", "airbnb": "airbnb", "akuna capital": "akunacapital",
  "anduril": "andurilindustries", "anthropic": "anthropic", "asana": "asana", "block": "block",
  "brex": "brex", "chime": "chime", "cloudflare": "cloudflare", "cockroach labs": "cockroachlabs",
  "coinbase": "coinbase", "coreweave": "coreweave", "databricks": "databricks", "datadog": "datadog",
  "discord": "discord", "dropbox": "dropbox", "duolingo": "duolingo", "elastic": "elastic",
  "figma": "figma", "five rings": "fiveringsllc", "gitlab": "gitlab", "godaddy": "godaddy",
  "grafana labs": "grafanalabs", "imc": "imc",
  "jane street": "janestreet", "jump trading": "jumptrading", "linkedin": "linkedin", "mongodb": "mongodb",
  "okta": "okta", "pinterest": "pinterest", "reddit": "reddit", "robinhood": "robinhood",
  "roblox": "roblox", "samsung semiconductor": "samsungsemiconductor", "scale ai": "scaleai", "sofi": "sofi",
  "stripe": "stripe", "temporal": "temporaltechnologies", "together ai": "togetherai", "vercel": "vercel",
  "virtu": "virtu", "xai": "xai",
}));

export function greenhouseBoard(target: TargetCompany): string | null {
  return boardByCompany.get(target.name.trim().toLowerCase()) ?? null;
}

function text(value: string | undefined): string {
  if (!value) return "";
  const decoded = load(`<div>${value}</div>`)("div").text();
  return load(`<div>${decoded}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

function locations(job: GreenhouseJob): string[] {
  const values = [job.location?.name, ...(job.offices ?? []).flatMap((office) => {
    const location = typeof office.location === "string" ? office.location : office.location?.name;
    return [location, office.name];
  })].filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(values.map((value) => value.trim()))];
}

export function extractGreenhouseJobs(
  payload: GreenhouseResponse,
  source: TargetSource,
  target: TargetCompany,
  observedAt: string,
): JobPosting[] {
  if (!Array.isArray(payload.jobs)) throw new Error("Greenhouse API returned an invalid response.");
  return payload.jobs.flatMap((record) => {
    const title = record.title?.trim() ?? "";
    const url = record.absolute_url?.trim() ?? "";
    if (!title || !url) return [];
    const description = text(record.content);
    if (!matchesTarget({ title, description }, target)) return [];
    const jobLocations = locations(record);
    const department = (record.departments ?? []).map(({ name }) => name).filter(Boolean).join(", ");
    return [{
      kind: "JOB" as const, id: idFor(target.id, url), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl: url, applicationUrl: url, title, description,
      locations: jobLocations, employmentType: employmentType(title, department),
      firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, url, jobLocations.join("|")), extractionConfidence: 0.99,
    }];
  });
}

export async function discoverGreenhouseJobs(
  source: TargetSource,
  target: TargetCompany,
  observedAt: string,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<JobPosting[]> {
  const board = greenhouseBoard(target);
  if (!board) return [];
  const payload = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
  return extractGreenhouseJobs(payload as GreenhouseResponse, source, target, observedAt);
}
