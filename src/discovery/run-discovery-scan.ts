import type { TargetCompany } from "../domain/opportunity.ts";
import { scanTargets } from "./scan-targets.ts";
import type { Repository } from "../storage/repository.ts";
import { dispatchDiscordNotifications } from "../notifications/discord.ts";

export async function runDiscoveryScan(repository: Repository, targets: TargetCompany[]) {
  const startedAt = new Date().toISOString();
  const result = await scanTargets(targets);
  const changes = await repository.saveJobs(result.jobs, result.scannedSourceIds);
  await repository.recordScan({ startedAt, finishedAt: result.scannedAt, targetCount: targets.length, jobCount: result.jobs.length, failures: result.failures, sourceResults: result.sourceResults });
  const delivery = await dispatchDiscordNotifications(repository, changes);
  return { ...result, changes, delivery };
}
