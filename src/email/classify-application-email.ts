import type { EmailClassification, GmailMessage } from "./types.ts";

const rules: Array<{
  status: EmailClassification["status"];
  confidence: number;
  patterns: RegExp[];
  commitmentKind?: EmailClassification["commitmentKind"];
}> = [
  { status: "OFFERED", confidence: 0.98, patterns: [/offer of employment/i, /pleased to offer you/i, /job offer/i] },
  { status: "REJECTED", confidence: 0.97, patterns: [/will not be moving forward/i, /not moving forward with your application/i, /decided to pursue other candidates/i, /unable to offer you/i] },
  { status: "INTERVIEW_SCHEDULED", confidence: 0.95, patterns: [/interview (?:is |has been )?scheduled/i, /interview confirmation/i, /confirmed.+interview/i], commitmentKind: "INTERVIEW" },
  { status: "INTERVIEW_REQUESTED", confidence: 0.91, patterns: [/schedule (?:an|your) interview/i, /availability.+interview/i, /invite you to interview/i], commitmentKind: "INTERVIEW" },
  { status: "ASSESSMENT_RECEIVED", confidence: 0.94, patterns: [/online assessment/i, /coding assessment/i, /coding challenge/i, /hackerrank/i, /codesignal/i], commitmentKind: "OA" },
  { status: "APPLIED", confidence: 0.9, patterns: [/application (?:has been )?received/i, /thank you for applying/i, /application confirmation/i] },
  { status: "STATUS_UPDATE", confidence: 0.72, patterns: [/application status/i, /update (?:on|regarding) your application/i] },
];

function extractScheduledAt(text: string, now = new Date()): string | null {
  const candidates = text.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?[,]?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s+[A-Z]{2,4})?)?/gi) ?? [];
  for (const candidate of candidates) {
    const normalized = candidate.replace(/(\d)(st|nd|rd|th)/i, "$1").replace(/\s+at\s+/i, " ");
    const includesYear = /\b\d{4}\b/.test(normalized);
    const parsed = new Date(includesYear ? normalized : `${normalized}, ${now.getUTCFullYear()}`);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime() - 86_400_000) return parsed.toISOString();
  }
  return null;
}

export function classifyApplicationEmail(message: Pick<GmailMessage, "subject" | "snippet" | "bodyText">, now = new Date()): EmailClassification | null {
  const text = `${message.subject}\n${message.snippet}\n${message.bodyText}`;
  for (const rule of rules) {
    const evidence = rule.patterns.flatMap((pattern) => text.match(pattern)?.[0] ?? []);
    if (!evidence.length) continue;
    return {
      status: rule.status,
      confidence: rule.confidence,
      evidence: [...new Set(evidence)].slice(0, 5),
      commitmentKind: rule.commitmentKind ?? null,
      scheduledAt: rule.commitmentKind ? extractScheduledAt(text, now) : null,
    };
  }
  return null;
}

export function proposePreparationBlocks(kind: "OA" | "INTERVIEW", scheduledAt: string) {
  const startsAt = new Date(scheduledAt);
  const offsets = kind === "INTERVIEW" ? [72, 48, 24] : [48, 24];
  const durationMinutes = kind === "INTERVIEW" ? 60 : 90;
  return offsets
    .map((hoursBefore) => {
      const start = new Date(startsAt.getTime() - hoursBefore * 3_600_000);
      return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString() };
    })
    .filter((block) => new Date(block.startsAt).getTime() > Date.now());
}
