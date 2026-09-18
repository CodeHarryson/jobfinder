import type { TargetCompany } from "../domain/opportunity.ts";
import { scanTargets } from "./scan-targets.ts";
import type { Repository } from "../storage/repository.ts";

export async function runDiscoveryScan(repository: Repository, targets: TargetCompany[]) {
  const startedAt = new Date().toISOString();
  const result = await scanTargets(targets);
  const changes = await repository.saveJobs(result.jobs, result.scannedSourceIds);
  await repository.recordScan({ startedAt, finishedAt: result.scannedAt, targetCount: targets.length, jobCount: result.jobs.length, failures: result.failures, sourceResults: result.sourceResults });
  const delivery = process.env.DISCORD_WEBHOOK_URL
    ? { enabled: true, queued: await repository.enqueueDiscordDeliveries(changes), sent: 0, failed: 0 }
    : { enabled: false, queued: 0, sent: 0, failed: 0 };
  return { ...result, changes, delivery };
}
