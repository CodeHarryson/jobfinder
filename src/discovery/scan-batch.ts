import type { TargetCompany } from "../domain/opportunity.ts";

export function selectScanBatch(targets: TargetCompany[], now = new Date(), batchSize = 25, intervalMs = 300_000) {
  if (targets.length <= batchSize) return { targets, batchIndex: 0, batchCount: targets.length ? 1 : 0 };
  const batchCount = Math.ceil(targets.length / batchSize);
  const batchIndex = Math.floor(now.getTime() / intervalMs) % batchCount;
  return { targets: targets.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize), batchIndex, batchCount };
}
