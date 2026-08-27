import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/email/request-auth";
import { getEmailAutomationStore } from "@/email/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorizeAutomationRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY && process.env.GMAIL_ALLOWED_EMAIL), ...(await getEmailAutomationStore().status()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Gmail status." }, { status: 503 });
  }
}

