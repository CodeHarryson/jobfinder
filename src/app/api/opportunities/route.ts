import { NextResponse } from "next/server";
import { getRepository } from "@/storage/jobfinder-repository";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: getRepository().listJobs() });
}
