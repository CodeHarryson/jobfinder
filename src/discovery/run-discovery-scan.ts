import type { TargetCompany } from "../domain/opportunity.ts";
import { scanTargets } from "./scan-targets.ts";
import type { JobFinderRepository } from "../storage/jobfinder-repository.ts";

export async function runDiscoveryScan(repository: JobFinderRepository, targets: TargetCompany[]) {
  const startedAt = new Date().toISOString();
  const result = await scanTargets(targets);
  const changes = repository.saveJobs(result.jobs);
  repository.recordScan({ startedAt, finishedAt: result.scannedAt, targetCount: targets.length, jobCount: result.jobs.length, failures: result.failures });
  return { ...result, changes };
}
