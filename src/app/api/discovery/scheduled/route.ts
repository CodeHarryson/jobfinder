import { NextResponse } from "next/server";
import { runScheduledDiscovery } from "@/discovery/run-scheduled-discovery";
import { getRepository } from "@/storage/get-repository";

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

  try {
    return NextResponse.json(await runScheduledDiscovery(getRepository()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled scan failed." }, { status: 500 });
  }
}
