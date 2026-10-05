import type { ScanHistoryEntry } from "../storage/repository.ts";

export type SourceFailureStreak = {
  companyId: string;
  sourceId: string;
  sourceUrl: string;
  provider: string;
  consecutiveFailures: number;
  firstFailedAt: string;
  lastFailedAt: string;
  message: string;
};

type Record_ = { companyId?: unknown; sourceId?: unknown; sourceUrl?: unknown; provider?: unknown; message?: unknown };

function records(values: unknown[]): Record_[] {
  return values.flatMap((value) => value && typeof value === "object" ? [value as Record_] : []);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Counts how many of the most recent scans failed for each source, walking a
 * newest-first history and stopping at the first scan in which that source
 * succeeded. Batching means a source is absent from most scans; an absence is
 * neither a success nor a failure, so it neither extends nor breaks a streak.
 */
export function sourceFailureStreaks(history: ScanHistoryEntry[]): SourceFailureStreak[] {
  const streaks = new Map<string, SourceFailureStreak>();
  const settled = new Set<string>();
  for (const scan of history) {
    for (const record of records(scan.sourceResults)) {
      const sourceId = text(record.sourceId);
      if (sourceId) settled.add(sourceId);
    }
    for (const record of records(scan.failures)) {
      const sourceId = text(record.sourceId);
      if (!sourceId || settled.has(sourceId)) continue;
      const existing = streaks.get(sourceId);
      if (existing) {
        existing.consecutiveFailures += 1;
        existing.firstFailedAt = scan.startedAt;
        continue;
      }
      streaks.set(sourceId, {
        companyId: text(record.companyId),
        sourceId,
        sourceUrl: text(record.sourceUrl),
        provider: text(record.provider) || "UNRESOLVED",
        consecutiveFailures: 1,
        firstFailedAt: scan.startedAt,
        lastFailedAt: scan.startedAt,
        message: text(record.message) || "Unknown scan error.",
      });
    }
  }
  return [...streaks.values()].sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);
}
