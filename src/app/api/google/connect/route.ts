import { NextResponse } from "next/server";
import { createOAuthState } from "@/email/crypto";
import { googleAuthorizationUrl } from "@/email/google";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!process.env.GMAIL_ALLOWED_EMAIL) return NextResponse.json({ error: "GMAIL_ALLOWED_EMAIL is required before Gmail can be connected." }, { status: 503 });
    const state = createOAuthState();
    const response = NextResponse.redirect(googleAuthorizationUrl(new URL(request.url).origin, state));
    response.cookies.set("google_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Google authorization." }, { status: 503 });
  }
}

