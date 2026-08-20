import { load } from "cheerio";
import type { RecruitingEvent, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { fingerprint, idFor } from "./extract-jobs.ts";

function meta($: ReturnType<typeof load>, name: string): string {
  return $(`meta[name="${name}"]`).attr("content")?.trim()
    ?? $(`meta[property="${name}"]`).attr("content")?.trim()
    ?? "";
}

function eventType(title: string): RecruitingEvent["eventType"] {
  if (/workshop/i.test(title)) return "WORKSHOP";
  if (/hackathon/i.test(title)) return "HACKATHON";
  if (/office hours/i.test(title)) return "OFFICE_HOURS";
  if (/info(?:rmation)? session/i.test(title)) return "INFO_SESSION";
  if (/conference/i.test(title)) return "CONFERENCE";
  if (/network/i.test(title)) return "NETWORKING";
  if (/campus|university|recruit/i.test(title)) return "CAMPUS_RECRUITING";
  return "OTHER";
}

function inferredLocation(title: string): string | null {
  const at = title.match(/\bat\s+(?:Google\s+)?(.+)$/i)?.[1]?.trim();
  return at || null;
}

export function extractEventPage(html: string, url: string, target: TargetCompany, observedAt = new Date().toISOString()): RecruitingEvent {
  const canonicalUrl = new URL(url).toString();
  const $ = load(html);
  const title = $("title").first().text().trim() || meta($, "og:title") || meta($, "twitter:title");
  const description = meta($, "description") || meta($, "og:description");
  if (!title) throw new Error("Event page did not provide a title.");
  const haystack = `${title} ${description}`.toLowerCase();
  if (target.eventKeywords.length && !target.eventKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    throw new Error("Event does not match the company event keywords.");
  }
  const source: TargetSource = target.sources.find(({ kind }) => kind === "EVENTS") ?? {
    id: `${target.id}-submitted-events`, kind: "EVENTS", url: canonicalUrl, enabled: true, scanCron: "* * * * *",
  };
  const location = inferredLocation(title);
  return {
    kind: "EVENT", id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
    sourceUrl: source.url, canonicalUrl, registrationUrl: canonicalUrl, title, description,
    eventType: eventType(title), startsAt: null, endsAt: null, timezone: "America/Toronto",
    format: /virtual|online/i.test(haystack) ? "VIRTUAL" : "IN_PERSON", location,
    registrationDeadline: null, audience: /intern/i.test(haystack) ? ["Internship candidates"] : ["Early-career candidates"],
    status: "REGISTRATION_OPEN", firstSeenAt: observedAt, lastSeenAt: observedAt,
    contentFingerprint: fingerprint(title, description, canonicalUrl, location ?? ""), extractionConfidence: 0.8,
  };
}
