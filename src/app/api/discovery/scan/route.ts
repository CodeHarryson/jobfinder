import { NextResponse } from "next/server";
import type { TargetCompany } from "@/domain/opportunity";
import { runDiscoveryScan } from "@/discovery/run-discovery-scan";
import { getRepository } from "@/storage/jobfinder-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const suppliedTargets = body && typeof body === "object" && Array.isArray((body as { targets?: unknown }).targets)
      ? (body as { targets: TargetCompany[] }).targets
      : [];
    const repository = getRepository();
    const targets = suppliedTargets.length ? suppliedTargets : repository.listTargets();
    if (!targets.length) return NextResponse.json({ error: "No target companies are configured." }, { status: 400 });
    if (targets.length > 25) return NextResponse.json({ error: "A scan is limited to 25 companies." }, { status: 400 });
    if (suppliedTargets.length) repository.saveTargets(suppliedTargets);
    const result = await runDiscoveryScan(repository, targets);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to scan targets." }, { status: 400 });
  }
}
