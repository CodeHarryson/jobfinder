import type { TargetCompany, TargetSource } from "../domain/opportunity.ts";
import type { SourceScanOutcome } from "../storage/repository.ts";
import { cronMatches } from "./cron.ts";
import { PRIORITY_COMPANY_NAMES } from "./scan-batch.ts";
import type { ScanFailure, SourceScanResult } from "./scan-targets.ts";

export const SOURCE_CLAIM_LIMIT = 25;
export const SOURCE_LEASE_MS = 4 * 60_000;

const FIVE_MINUTES = 5 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;
const THIRTY_MINUTES = 30 * 60_000;
const SIX_HOURS = 6 * 60 * 60_000;
const priorityNames = new Set(PRIORITY_COMPANY_NAMES.map((name) => name.toLowerCase()));

function isStructuredProvider(provider: string): boolean {
  return provider !== "GENERIC_HTML" && provider !== "UNRESOLVED";
}

export function sourceBaseIntervalMs(target: TargetCompany, provider: string): number {
  if (priorityNames.has(target.name.trim().toLowerCase()) && isStructuredProvider(provider)) return FIVE_MINUTES;
  return isStructuredProvider(provider) ? FIFTEEN_MINUTES : THIRTY_MINUTES;
}

function nextCronOccurrence(expression: string, earliest: Date): Date {
  const candidate = new Date(earliest);
  candidate.setUTCSeconds(0, 0);
  if (candidate.getTime() < earliest.getTime()) candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  // Five-field cron expressions repeat within a year. Returning the earliest
  // time as a defensive fallback keeps an invalid legacy schedule from
  // permanently disabling its source.
  for (let minute = 0; minute < 366 * 24 * 60; minute += 1) {
    if (cronMatches(expression, candidate)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return earliest;
}

export function nextSourceRunAt(
  target: TargetCompany,
  source: TargetSource,
  provider: string,
  consecutiveFailures: number,
  attemptedAt: Date,
): Date {
  const base = sourceBaseIntervalMs(target, provider);
  const delay = consecutiveFailures
    ? Math.min(SIX_HOURS, base * 2 ** Math.min(consecutiveFailures, 6))
    : base;
  return nextCronOccurrence(source.scanCron, new Date(attemptedAt.getTime() + delay));
}

export function sourceScanOutcomes(
  targets: TargetCompany[],
  successes: SourceScanResult[],
  failures: ScanFailure[],
  previousFailures: ReadonlyMap<string, number>,
  attemptedAt: Date,
): SourceScanOutcome[] {
  const successBySource = new Map(successes.map((result) => [result.sourceId, result]));
  const failureBySource = new Map(failures.map((failure) => [failure.sourceId, failure]));
  return targets.flatMap((target) => target.sources.map((source) => {
    const success = successBySource.get(source.id);
    const failure = failureBySource.get(source.id);
    const succeeded = Boolean(success);
    const consecutiveFailures = succeeded ? 0 : (previousFailures.get(source.id) ?? 0) + 1;
    const provider = success?.provider ?? failure?.provider ?? "UNRESOLVED";
    const error = succeeded ? null : failure?.message ?? "Scanner returned no outcome for the claimed source.";
    return {
      sourceId: source.id,
      provider,
      succeeded,
      error,
      attemptedAt: attemptedAt.toISOString(),
      nextRunAt: nextSourceRunAt(target, source, provider, consecutiveFailures, attemptedAt).toISOString(),
    };
  }));
}

export const PRIORITY_SOURCE_COMPANY_NAMES = [...PRIORITY_COMPANY_NAMES];
