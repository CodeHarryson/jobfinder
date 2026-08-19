import { NextResponse } from "next/server";
import { getRepository } from "@/storage/get-repository";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: await getRepository().listJobs() });
}
