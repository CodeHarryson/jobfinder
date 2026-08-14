import type { SourceKind, TargetCompany, TargetSource } from "./opportunity.ts";

export type TargetCompanyInput = {
  name: string;
  domain: string;
  careerUrl: string;
  earlyCareersUrl?: string;
  eventsUrl?: string;
  priority?: TargetCompany["priority"];
  roleKeywords?: string[];
  eventKeywords?: string[];
  scanCron?: string;
};

export type ValidationResult =
  | { ok: true; value: TargetCompany }
  | { ok: false; errors: string[] };

const DEFAULT_CRON = "* * * * *";

function cleanKeywords(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function parseHttpUrl(value: string, field: string, errors: string[]): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      errors.push(`${field} must use http or https.`);
      return null;
    }
    return url;
  } catch {
    errors.push(`${field} must be a valid URL.`);
    return null;
  }
}

export function createTargetCompany(input: TargetCompanyInput): ValidationResult {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("Company name is required.");

  const normalizedDomain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!normalizedDomain || normalizedDomain.includes("/")) errors.push("Domain must be a hostname.");

  const sourceInputs: Array<[SourceKind, string | undefined, string]> = [
    ["CAREERS", input.careerUrl, "Career URL"],
    ["EARLY_CAREERS", input.earlyCareersUrl, "Early-careers URL"],
    ["EVENTS", input.eventsUrl, "Events URL"],
  ];

  const parsedSources = sourceInputs.flatMap(([kind, value, label]) => {
    if (!value?.trim()) return [];
    const parsed = parseHttpUrl(value.trim(), label, errors);
    return parsed ? [{ kind, url: parsed.toString() }] : [];
  });

  if (!input.careerUrl.trim()) errors.push("Career URL is required.");
  if (errors.length) return { ok: false, errors };

  const id = crypto.randomUUID();
  const scanCron = input.scanCron?.trim() || DEFAULT_CRON;
  const sources: TargetSource[] = parsedSources.map((source) => ({
    id: crypto.randomUUID(),
    kind: source.kind,
    url: source.url,
    enabled: true,
    scanCron,
  }));

  return {
    ok: true,
    value: {
      id,
      name,
      domain: normalizedDomain,
      priority: input.priority ?? "MEDIUM",
      roleKeywords: cleanKeywords(input.roleKeywords),
      eventKeywords: cleanKeywords(input.eventKeywords),
      sources,
      createdAt: new Date().toISOString(),
    },
  };
}
