import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";

type JsonRecord = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripMarkup(value: string): string {
  return load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

function canonicalUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gh_src|lever-|source|ref)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export function idFor(companyId: string, url: string): string {
  return fingerprint(companyId, url).slice(0, 24);
}

export function employmentType(title: string, rawType = ""): JobPosting["employmentType"] {
  const text = `${title} ${rawType}`.toLowerCase();
  if (/\b(?:intern|internship|co[ -]?op)\b/.test(text)) return "INTERNSHIP";
  if (/\b(?:new grad(?:uate)?|graduate (?:role|program|engineer)|entry[ -]level)\b/.test(text)) return "NEW_GRAD";
  if (/\b(?:early career|apprentice|apprenticeship)\b/.test(text)) return "EARLY_CAREER";
  return "OTHER";
}

const EARLY_CAREER_ROLE = /\b(?:intern|internship|co[ -]?op|new grad(?:uate)?|graduate (?:role|program|engineer)|early career|entry[ -]level|apprentice|apprenticeship)\b/i;
const HIRING_TEAM_ROLE = /\b(?:recruiter|recruiting|talent acquisition|campus recruiting|university recruiting|program manager)\b|\bmanager\b.*\bintern(?:ship)? program\b/i;
const NAVIGATION_TITLE = /^(?:early careers?|internships?(?: for students)?|university recruiting|explore |find |view |search jobs?|watch (?:the )?film)/i;

function isEligibleEarlyCareerTitle(title: string): boolean {
  return EARLY_CAREER_ROLE.test(title) && !HIRING_TEAM_ROLE.test(title) && !NAVIGATION_TITLE.test(title.trim());
}

function isLikelyJobDetailUrl(value: string): boolean {
  const url = new URL(value);
  if (/\.(?:mp4|mov|pdf|jpg|png)$/i.test(url.pathname)) return false;
  if (/\/(?:search|jobsearch|early-careers?|career-programs|university-recruiting)\/?$/i.test(url.pathname)) return false;
  return /(?:job-boards\.greenhouse\.io\/.+\/jobs\/\d+|jobs\.ashbyhq\.com\/.+\/[0-9a-f-]{20,}|jobs\.lever\.co\/.+\/[0-9a-f-]{20,}|https?:\/\/jobs\.[^/]+\/.+\/[\w-]{4,}|\/job_details\/\d+|\/details\/\d+|\/jobs?\/[\w-]{4,})/i.test(value);
}

function locationsFrom(record: JsonRecord): string[] {
  const raw = record.jobLocation;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const address = (entry as JsonRecord).address;
    if (!address || typeof address !== "object") return [];
    const parts = ["addressLocality", "addressRegion", "addressCountry"]
      .map((key) => asText((address as JsonRecord)[key])).filter(Boolean);
    return parts.length ? [parts.join(", ")] : [];
  });
}

function jsonLdRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdRecords);
  if (!value || typeof value !== "object") return [];
  const record = value as JsonRecord;
  return [record, ...jsonLdRecords(record["@graph"])];
}

function decodedJsonString(value: string): string {
  try { return JSON.parse(value) as string; } catch { return ""; }
}

export function matchesTarget(job: Pick<JobPosting, "title" | "description">, target: TargetCompany): boolean {
  if (!isEligibleEarlyCareerTitle(job.title)) return false;
  if (!target.roleKeywords.length) return true;
  const haystack = `${job.title} ${job.description}`.toLowerCase();
  return target.roleKeywords.some((keyword) => {
    const escaped = keyword.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped ? new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, "i").test(haystack) : false;
  });
}

export function extractJobs(html: string, source: TargetSource, target: TargetCompany, observedAt = new Date().toISOString()): JobPosting[] {
  const $ = load(html);
  const jobs: JobPosting[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed: unknown = JSON.parse($(element).text());
      for (const record of jsonLdRecords(parsed)) {
        const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        if (!types.includes("JobPosting")) continue;
        const title = asText(record.title) || asText(record.name);
        const url = canonicalUrl(asText(record.url) || source.url, source.url);
        if (!title || !url) continue;
        const description = stripMarkup(asText(record.description));
        const job: JobPosting = {
          kind: "JOB", id: idFor(target.id, url), companyId: target.id, sourceId: source.id,
          sourceUrl: source.url, canonicalUrl: url, applicationUrl: url, title, description,
          locations: locationsFrom(record), employmentType: employmentType(title, asText(record.employmentType)),
          firstSeenAt: observedAt, lastSeenAt: observedAt,
          contentFingerprint: fingerprint(title, description, url), extractionConfidence: 0.95,
        };
        if (matchesTarget(job, target)) jobs.push(job);
      }
    } catch {
      // Invalid third-party JSON-LD should not fail the rest of the page.
    }
  });

  // Some React applications serialize repeated title/href field pairs into
  // their server component payload instead of rendering ordinary anchors.
  const fieldPair = /\[0,"title"\],\[0,("(?:\\.|[^"\\])*")\],\[0,"href"\],\[0,("(?:\\.|[^"\\])*")\]/g;
  for (const match of html.matchAll(fieldPair)) {
    const title = decodedJsonString(match[1]);
    const href = canonicalUrl(decodedJsonString(match[2]), source.url);
    if (!title || !href) continue;
    const job: JobPosting = {
      kind: "JOB", id: idFor(target.id, href), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl: href, applicationUrl: href, title, description: "",
      locations: [], employmentType: employmentType(title), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, href), extractionConfidence: 0.75,
    };
    if (matchesTarget(job, target)) jobs.push(job);
  }

  // React Flight and similar normalized payloads may define field names once,
  // then serialize each job as adjacent title and URL tuples.
  const adjacentPair = /\[0,("(?:\\.|[^"\\])*")\],\[0,("https?:\\?\/\\?\/(?:\\.|[^"\\])*")\]/g;
  for (const match of html.matchAll(adjacentPair)) {
    const title = decodedJsonString(match[1]);
    const href = canonicalUrl(decodedJsonString(match[2]).replaceAll("\\/", "/"), source.url);
    if (!title || !href || !isLikelyJobDetailUrl(href)) continue;
    const job: JobPosting = {
      kind: "JOB", id: idFor(target.id, href), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl: href, applicationUrl: href, title, description: "",
      locations: [], employmentType: employmentType(title), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, href), extractionConfidence: 0.7,
    };
    if (matchesTarget(job, target)) jobs.push(job);
  }

  $("a[href]").each((_, element) => {
    const title = $(element).text().replace(/\s+/g, " ").trim();
    const href = canonicalUrl($(element).attr("href") ?? "", source.url);
    if (!title || !href || !isLikelyJobDetailUrl(href)) return;
    const job: JobPosting = {
      kind: "JOB", id: idFor(target.id, href), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl: href, applicationUrl: href, title, description: "",
      locations: [], employmentType: employmentType(title), firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, href), extractionConfidence: 0.55,
    };
    if (matchesTarget(job, target)) jobs.push(job);
  });

  return [...new Map(jobs.sort((a, b) => b.extractionConfidence - a.extractionConfidence).map((job) => [job.canonicalUrl, job])).values()];
}
