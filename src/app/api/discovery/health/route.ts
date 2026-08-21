import { NextResponse } from "next/server";
import { getRepository } from "@/storage/get-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getRepository().getDiscoveryHealth();
    return NextResponse.json(health ?? { status: "NO_SCANS", sourceResults: [], failures: [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load discovery health." }, { status: 500 });
  }
}
