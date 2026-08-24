import type { TargetCompany } from "../domain/opportunity.ts";

export const PRIORITY_COMPANY_NAMES = [
  "Google", "Stripe", "OpenAI", "Netflix", "Bloomberg", "Pinterest", "HubSpot", "NVIDIA", "Microsoft", "Amazon",
  "Meta", "Apple", "Datadog", "Cloudflare", "Snowflake", "Confluent", "MongoDB", "Cockroach Labs", "Uber", "Airbnb",
  "Coinbase", "Block", "Ramp", "Robinhood", "Affirm",
] as const;

const priorityNames = new Set(PRIORITY_COMPANY_NAMES.map((name) => name.toLowerCase()));

export function selectScanBatch(targets: TargetCompany[], now = new Date(), batchSize = 25, intervalMs = 300_000) {
  if (targets.length <= batchSize) return { targets, batchIndex: 0, batchCount: targets.length ? 1 : 0 };
  const priorityTargets = targets.filter((target) => priorityNames.has(target.name.trim().toLowerCase()));
  const standardTargets = targets.filter((target) => !priorityNames.has(target.name.trim().toLowerCase()));
  if (priorityTargets.length && standardTargets.length) {
    const intervalIndex = Math.floor(now.getTime() / intervalMs);
    const selectedPool = intervalIndex % 2 === 0 ? priorityTargets : standardTargets;
    const batchCount = Math.ceil(selectedPool.length / batchSize);
    const batchIndex = Math.floor(intervalIndex / 2) % batchCount;
    return {
      targets: selectedPool.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize),
      batchIndex,
      batchCount,
    };
  }
  const batchCount = Math.ceil(targets.length / batchSize);
  const batchIndex = Math.floor(now.getTime() / intervalMs) % batchCount;
  return { targets: targets.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize), batchIndex, batchCount };
}
