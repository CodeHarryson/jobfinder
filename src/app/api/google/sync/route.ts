import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/email/request-auth";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizeAutomationRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await inngest.send({ name: "jobfinder/gmail.sync.requested", data: { requestedAt: new Date().toISOString() } });
    return NextResponse.json({ accepted: true, ids: result.ids }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue Gmail sync." }, { status: 503 });
  }
}

