import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { JobPosting, TargetCompany } from "../domain/opportunity.ts";
import { extractJobs } from "./extract-jobs.ts";

export type ScanFailure = { companyId: string; sourceId: string; sourceUrl: string; message: string };
export type ScanResult = { jobs: JobPosting[]; failures: ScanFailure[]; scannedAt: string };

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

export async function scanTargets(targets: TargetCompany[], fetchPage: (url: string) => Promise<string> = fetchCareerPage): Promise<ScanResult> {
  const scannedAt = new Date().toISOString();
  const jobs: JobPosting[] = [];
  const failures: ScanFailure[] = [];

  for (const target of targets.slice(0, 25)) {
    const sources = target.sources.filter((source) => source.enabled && source.kind !== "EVENTS").slice(0, 5);
    for (const source of sources) {
      try {
        const html = await fetchPage(source.url);
        jobs.push(...extractJobs(html, source, target, scannedAt));
      } catch (error) {
        failures.push({ companyId: target.id, sourceId: source.id, sourceUrl: source.url, message: error instanceof Error ? error.message : "Unknown scan error." });
      }
    }
  }

  const deduplicated = [...new Map(jobs.sort((a, b) => b.extractionConfidence - a.extractionConfidence).map((job) => [`${job.companyId}:${job.canonicalUrl}`, job])).values()];
  return { jobs: deduplicated, failures, scannedAt };
}
