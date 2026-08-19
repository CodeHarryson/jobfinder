import type { JobPosting, TargetCompany } from "../domain/opportunity.ts";
import type { DiscoveryChange, NotificationDelivery, NotificationItem } from "./jobfinder-repository.ts";

export interface Repository {
  listTargets(): Promise<TargetCompany[]>;
  saveTarget(target: TargetCompany): Promise<TargetCompany>;
  saveTargets(targets: TargetCompany[]): Promise<TargetCompany[]>;
  deleteTarget(id: string): Promise<boolean>;
  listJobs(): Promise<JobPosting[]>;
  saveJobs(jobs: JobPosting[], scannedSourceIds?: string[]): Promise<DiscoveryChange[]>;
  listNotifications(unreadOnly?: boolean): Promise<NotificationItem[]>;
  markNotificationRead(id: string): Promise<boolean>;
  markAllNotificationsRead(): Promise<number>;
  deleteNotification(id: string): Promise<boolean>;
  enqueueDiscordDeliveries(changes: DiscoveryChange[]): Promise<number>;
  claimDiscordDeliveries(limit?: number, now?: Date): Promise<NotificationDelivery[]>;
  completeDiscordDelivery(id: string, externalId: string): Promise<void>;
  failDiscordDelivery(id: string, attempts: number, error: string): Promise<void>;
  recordScan(input: { startedAt: string; finishedAt: string; targetCount: number; jobCount: number; failures: unknown[] }): Promise<void>;
}
