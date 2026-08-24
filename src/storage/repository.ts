import type { JobPosting, RecruitingEvent, TargetCompany } from "../domain/opportunity.ts";
import type { DiscoveryChange, NotificationDelivery, NotificationItem } from "./jobfinder-repository.ts";

export type DiscoveryHealth = {
  startedAt: string; finishedAt: string; targetCount: number; jobCount: number;
  failureCount: number; failures: unknown[]; sourceResults: unknown[];
  companyHealth: CompanyDiscoveryHealth[];
};

export type CompanyDiscoveryHealth = {
  companyId: string;
  lastAttemptedAt: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  providers: string[];
  discoveredCount: number;
  unitedStatesCount: number;
  errors: string[];
};

type ScanHistoryEntry = { startedAt: string; failures: unknown[]; sourceResults: unknown[] };
type ScanRecord = { companyId?: unknown; provider?: unknown; discoveredCount?: unknown; unitedStatesCount?: unknown; message?: unknown };

export function companyHealthFromHistory(history: ScanHistoryEntry[]): CompanyDiscoveryHealth[] {
  const latest = new Map<string, CompanyDiscoveryHealth>();
  for (const scan of history) {
    const grouped = new Map<string, { successes: ScanRecord[]; failures: ScanRecord[] }>();
    for (const [kind, records] of [["successes", scan.sourceResults], ["failures", scan.failures]] as const) {
      for (const value of records) {
        if (!value || typeof value !== "object") continue;
        const record = value as ScanRecord;
        if (typeof record.companyId !== "string") continue;
        const group = grouped.get(record.companyId) ?? { successes: [], failures: [] };
        group[kind].push(record);
        grouped.set(record.companyId, group);
      }
    }
    for (const [companyId, group] of grouped) {
      if (latest.has(companyId)) continue;
      latest.set(companyId, {
        companyId,
        lastAttemptedAt: scan.startedAt,
        status: group.failures.length ? (group.successes.length ? "PARTIAL" : "FAILED") : "SUCCESS",
        providers: [...new Set([...group.successes, ...group.failures].flatMap((record) => typeof record.provider === "string" ? [record.provider] : []))],
        discoveredCount: group.successes.reduce((total, record) => total + Number(record.discoveredCount ?? 0), 0),
        unitedStatesCount: group.successes.reduce((total, record) => total + Number(record.unitedStatesCount ?? 0), 0),
        errors: group.failures.flatMap((record) => typeof record.message === "string" ? [record.message] : []),
      });
    }
  }
  return [...latest.values()];
}

export interface Repository {
  listTargets(): Promise<TargetCompany[]>;
  saveTarget(target: TargetCompany): Promise<TargetCompany>;
  saveTargets(targets: TargetCompany[]): Promise<TargetCompany[]>;
  deleteTarget(id: string): Promise<boolean>;
  listJobs(): Promise<JobPosting[]>;
  saveJobs(jobs: JobPosting[], scannedSourceIds?: string[]): Promise<DiscoveryChange[]>;
  listEvents(): Promise<RecruitingEvent[]>;
  saveEvent(event: RecruitingEvent): Promise<"NEW" | "UPDATED" | null>;
  listNotifications(unreadOnly?: boolean): Promise<NotificationItem[]>;
  markNotificationRead(id: string): Promise<boolean>;
  markAllNotificationsRead(): Promise<number>;
  deleteNotification(id: string): Promise<boolean>;
  enqueueDiscordDeliveries(changes: DiscoveryChange[]): Promise<number>;
  claimDiscordDeliveries(limit?: number, now?: Date): Promise<NotificationDelivery[]>;
  completeDiscordDelivery(id: string, externalId: string): Promise<void>;
  failDiscordDelivery(id: string, attempts: number, error: string): Promise<void>;
  recordScan(input: { startedAt: string; finishedAt: string; targetCount: number; jobCount: number; failures: unknown[]; sourceResults?: unknown[] }): Promise<void>;
  getDiscoveryHealth(): Promise<DiscoveryHealth | null>;
}
