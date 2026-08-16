import { NextResponse } from "next/server";
import type { TargetCompany } from "@/domain/opportunity";
import { getRepository } from "@/storage/jobfinder-repository";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const target = await request.json() as TargetCompany;
    if (!target || target.id !== id) return NextResponse.json({ error: "Target ID does not match the route." }, { status: 400 });
    getRepository().saveTarget(target);
    return NextResponse.json({ target });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update target." }, { status: 409 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = getRepository().deleteTarget(id);
  return deleted ? new Response(null, { status: 204 }) : NextResponse.json({ error: "Target not found." }, { status: 404 });
}
