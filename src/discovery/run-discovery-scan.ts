import type { TargetCompany } from "../domain/opportunity.ts";
import { scanTargets } from "./scan-targets.ts";
import type { Repository } from "../storage/repository.ts";
import type { DiscordChannel } from "../storage/jobfinder-repository.ts";

export async function runDiscoveryScan(repository: Repository, targets: TargetCompany[]) {
  const startedAt = new Date().toISOString();
  const result = await scanTargets(targets);
  const changes = await repository.saveJobs(result.jobs, result.scannedSourceIds);
  await repository.recordScan({ startedAt, finishedAt: new Date().toISOString(), targetCount: targets.length, jobCount: result.jobs.length, failures: result.failures, sourceResults: result.sourceResults });
  const channels: DiscordChannel[] = [
    ...(process.env.DISCORD_WEBHOOK_URL ? ["DISCORD" as const] : []),
    ...(process.env.DISCORD_SECONDARY_WEBHOOK_URL ? ["DISCORD_SECONDARY" as const] : []),
  ];
  const delivery = channels.length
    ? { enabled: true, queued: await repository.enqueueDiscordDeliveries(changes, channels), sent: 0, failed: 0 }
    : { enabled: false, queued: 0, sent: 0, failed: 0 };
  return { ...result, changes, delivery };
}
