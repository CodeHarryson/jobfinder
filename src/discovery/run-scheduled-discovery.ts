import { runDiscoveryScan } from "./run-discovery-scan.ts";
import type { Repository } from "../storage/repository.ts";
import { PRIORITY_SOURCE_COMPANY_NAMES, SOURCE_CLAIM_LIMIT, SOURCE_LEASE_MS, sourceScanOutcomes } from "./source-schedule.ts";

export async function runScheduledDiscovery(repository: Repository, now = new Date()) {
  const dueTargets = await repository.claimDueSources(now, SOURCE_CLAIM_LIMIT, SOURCE_LEASE_MS, PRIORITY_SOURCE_COMPANY_NAMES);
  if (!dueTargets.length) return { skipped: true as const, scannedAt: now.toISOString(), reason: "No sources are due or all due sources are leased." };

  const sourceIds = dueTargets.flatMap((target) => target.sources.map((source) => source.id));
  const previousFailures = await repository.getSourceFailureCounts(sourceIds);
  const result = await runDiscoveryScan(repository, dueTargets);
  await repository.completeSourceScans(sourceScanOutcomes(dueTargets, result.sourceResults, result.failures, previousFailures, new Date()));
  return {
    skipped: false as const,
    ok: true as const,
    scannedAt: result.scannedAt,
    jobsFound: result.jobs.length,
    changesFound: result.changes.length,
    sourcesScanned: result.sourceResults.length,
    sourcesFailed: result.failures.length,
    failures: result.failures,
    notifications: result.delivery,
    sourcesClaimed: sourceIds.length,
    targetsClaimed: dueTargets.length,
  };
}
