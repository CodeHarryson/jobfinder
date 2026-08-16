import { NextResponse } from "next/server";
import type { TargetCompany } from "@/domain/opportunity";
import { getRepository } from "@/storage/jobfinder-repository";

export const runtime = "nodejs";

function isTargetCompany(value: unknown): value is TargetCompany {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<TargetCompany>;
  return typeof target.id === "string" && typeof target.name === "string" && typeof target.domain === "string"
    && typeof target.createdAt === "string" && Array.isArray(target.roleKeywords) && Array.isArray(target.eventKeywords)
    && Array.isArray(target.sources) && target.sources.every((source) => source && typeof source.id === "string"
      && typeof source.url === "string" && typeof source.kind === "string" && typeof source.scanCron === "string");
}

export async function GET() {
  return NextResponse.json({ targets: getRepository().listTargets() });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const values = body && typeof body === "object" && Array.isArray((body as { targets?: unknown }).targets)
      ? (body as { targets: unknown[] }).targets
      : [body];
    if (!values.length || values.length > 50 || !values.every(isTargetCompany)) {
      return NextResponse.json({ error: "One to 50 valid target companies are required." }, { status: 400 });
    }
    return NextResponse.json({ targets: getRepository().saveTargets(values) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save targets." }, { status: 409 });
  }
}
