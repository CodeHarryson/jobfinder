import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { JobPosting, TargetCompany } from "../domain/opportunity.ts";
import { extractJobs } from "./extract-jobs.ts";
import { discoverEightfoldJobs, eightfoldConfig } from "./eightfold.ts";
import { discoverGreenhouseJobs, greenhouseBoard } from "./greenhouse.ts";
import { discoverJibeJobs, jibeConfig } from "./jibe.ts";
import { ashbyBoard, discoverAshbyJobs } from "./ashby.ts";
import { discoverLeverJobs, leverSite } from "./lever.ts";
import { discoverWorkdayJobs, workdayConfig } from "./workday.ts";
import { discoverPhenomJobs, phenomConfig } from "./phenom.ts";
import { discoverOracleHcmJobs, oracleHcmConfig } from "./oracle-hcm.ts";

export type ScanFailure = { companyId: string; sourceId: string; sourceUrl: string; provider: string; message: string };
export type SourceScanResult = {
  companyId: string; sourceId: string; sourceUrl: string; provider: string;
  discoveredCount: number; unitedStatesCount: number; status: "SUCCESS";
};
export type ScanResult = { jobs: JobPosting[]; failures: ScanFailure[]; sourceResults: SourceScanResult[]; scannedAt: string; scannedSourceIds: string[] };

export function isUnitedStatesJob(job: Pick<JobPosting, "locations">): boolean {
  const states = "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia";
  const stateCodes = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
  return job.locations.some((location) => {
    if (/\b(?:United States(?: of America)?|USA|U\.S\.A\.|US)\b/i.test(location)) return true;
    return location.split(/[;|]/).some((part) => {
      const value = part.trim();
      const components = value.split(",").map((component) => component.trim()).filter(Boolean);
      // In a three-part location, a terminal ISO code takes precedence over
      // state-like tokens: "Cork, CO, IE" is Ireland, not Colorado.
      if (components.length >= 3 && /^[A-Z]{2}$/i.test(components.at(-1) ?? "")) return false;
      if (new RegExp(`(?:^|[,–—-]\\s*)(?:${states})$`, "i").test(value)) return true;
      // A state abbreviation requires a preceding locality. Bare "CO" can
      // mean Colombia and must not be treated as Colorado.
      return components.length === 2 && new RegExp(`^(?:${stateCodes})$`).test(components[1]);
    });
  });
}

function isPrivateAddress(address: string): boolean {
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)/i.test(address)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

async function assertPublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP(S) sources can be scanned.");
  if (url.username || url.password) throw new Error("Source URLs cannot contain credentials.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Private sources cannot be scanned.");
  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error("Private sources cannot be scanned.");
  } else {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Source resolved to a private address.");
  }
  return url;
}

export async function fetchCareerPage(url: string): Promise<string> {
  const safeUrl = await assertPublicUrl(url);
  const response = await fetch(safeUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "JobFinderDiscovery/0.1 (+local development)" },
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("Source did not return HTML.");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 5_000_000) throw new Error("Source response exceeded 5 MB.");
  const html = await response.text();
  if (html.length > 5_000_000) throw new Error("Source response exceeded 5 MB.");
  return html;
}

export type PublicJsonFetcher = (url: string, init?: RequestInit) => Promise<unknown>;

export async function fetchPublicJson(url: string, init?: RequestInit): Promise<unknown> {
  const safeUrl = await assertPublicUrl(url);
  const response = await fetch(safeUrl, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json", "User-Agent": "JobFinderDiscovery/0.1 (+local development)", ...init?.headers },
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("Source did not return JSON.");
  return response.json();
}

export async function scanTargets(
  targets: TargetCompany[],
  fetchPage: (url: string) => Promise<string> = fetchCareerPage,
  fetchJson: PublicJsonFetcher = fetchPublicJson,
): Promise<ScanResult> {
  const scannedAt = new Date().toISOString();
  const jobs: JobPosting[] = [];
  const failures: ScanFailure[] = [];
  const sourceResults: SourceScanResult[] = [];
  const scannedSourceIds: string[] = [];

  const tasks = targets.slice(0, 25).flatMap((target) => target.sources
    .filter((source) => source.enabled && source.kind !== "EVENTS").slice(0, 5)
    .map((source) => ({ target, source })));
  let nextTask = 0;
  await Promise.all(Array.from({ length: Math.min(5, tasks.length) }, async () => {
    while (nextTask < tasks.length) {
      const { target, source } = tasks[nextTask++];
      let provider = "UNRESOLVED";
      try {
        let discovered: JobPosting[];
        if (eightfoldConfig(target)) {
          provider = "EIGHTFOLD";
          discovered = await discoverEightfoldJobs(source, target, scannedAt, fetchJson);
        } else if (greenhouseBoard(target)) {
          provider = "GREENHOUSE";
          discovered = await discoverGreenhouseJobs(source, target, scannedAt, fetchJson);
        } else if (jibeConfig(target)) {
          provider = "JIBE";
          discovered = await discoverJibeJobs(source, target, scannedAt, fetchJson);
        } else if (ashbyBoard(target)) {
          provider = "ASHBY";
          discovered = await discoverAshbyJobs(source, target, scannedAt, fetchJson);
        } else if (leverSite(target)) {
          provider = "LEVER";
          discovered = await discoverLeverJobs(source, target, scannedAt, fetchJson);
        } else if (workdayConfig(target)) {
          provider = "WORKDAY";
          discovered = await discoverWorkdayJobs(source, target, scannedAt, fetchJson);
        } else if (phenomConfig(target)) {
          provider = "PHENOM";
          discovered = await discoverPhenomJobs(source, target, scannedAt, fetchJson);
        } else if (oracleHcmConfig(target)) {
          provider = "ORACLE_HCM";
          discovered = await discoverOracleHcmJobs(source, target, scannedAt, fetchJson);
        } else {
          provider = "GENERIC_HTML";
          const html = await fetchPage(source.url);
          discovered = extractJobs(html, source, target, scannedAt);
          if (!discovered.length) throw new Error("Source loaded but no job records were extractable; provider adapter may be required.");
        }
        jobs.push(...discovered);
        sourceResults.push({ companyId: target.id, sourceId: source.id, sourceUrl: source.url, provider,
          discoveredCount: discovered.length, unitedStatesCount: discovered.filter(isUnitedStatesJob).length, status: "SUCCESS" });
        scannedSourceIds.push(source.id);
      } catch (error) {
        failures.push({ companyId: target.id, sourceId: source.id, sourceUrl: source.url, provider,
          message: error instanceof Error ? error.message : "Unknown scan error." });
      }
    }
  }));

  const deduplicated = [...new Map(jobs
    .filter(isUnitedStatesJob)
    .sort((a, b) => b.extractionConfidence - a.extractionConfidence)
    .map((job) => [`${job.companyId}:${job.canonicalUrl}`, job])).values()];
  return { jobs: deduplicated, failures, sourceResults, scannedAt, scannedSourceIds };
}
