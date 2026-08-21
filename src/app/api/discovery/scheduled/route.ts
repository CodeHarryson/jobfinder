import { NextResponse } from "next/server";
import { cronMatches } from "@/discovery/cron";
import { runDiscoveryScan } from "@/discovery/run-discovery-scan";
import { getRepository } from "@/storage/get-repository";
import { selectScanBatch } from "@/discovery/scan-batch";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is required in production." }, { status: 503 });
  }

  const repository = getRepository();
  const now = new Date();
  const dueTargets = (await repository.listTargets()).flatMap((target) => {
    const dueSources = target.sources.filter((source) => source.enabled && cronMatches(source.scanCron, now));
    return dueSources.length ? [{ ...target, sources: dueSources }] : [];
  });
  if (!dueTargets.length) return NextResponse.json({ scannedAt: now.toISOString(), skipped: true, reason: "No sources are due." });
  const batch = selectScanBatch(dueTargets, now);

  try {
    return NextResponse.json({ ...await runDiscoveryScan(repository, batch.targets), batchIndex: batch.batchIndex, batchCount: batch.batchCount, totalDueTargets: dueTargets.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled scan failed." }, { status: 500 });
  }
}
