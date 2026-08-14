import { NextResponse } from "next/server";
import type { TargetCompany } from "@/domain/opportunity";
import { scanTargets } from "@/discovery/scan-targets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { targets?: unknown }).targets)) {
      return NextResponse.json({ error: "A targets array is required." }, { status: 400 });
    }
    const targets = (body as { targets: TargetCompany[] }).targets;
    if (targets.length > 25) return NextResponse.json({ error: "A scan is limited to 25 companies." }, { status: 400 });
    const result = await scanTargets(targets);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to scan targets." }, { status: 400 });
  }
}
