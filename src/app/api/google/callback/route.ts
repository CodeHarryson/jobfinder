import { NextResponse } from "next/server";
import { verifyOAuthState } from "@/email/crypto";
import { exchangeGoogleCode, googleProfile, googleScopes } from "@/email/google";
import { getEmailAutomationStore } from "@/email/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers.get("cookie")?.match(/(?:^|;\s*)google_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !cookieState || decodeURIComponent(cookieState) !== state || !verifyOAuthState(state)) {
    return NextResponse.json({ error: "Invalid or expired Google OAuth state." }, { status: 400 });
  }
  try {
    const tokens = await exchangeGoogleCode(code, url.origin);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Remove JobFinder from Google account access and reconnect.");
    const profile = await googleProfile(tokens.access_token);
    const allowed = process.env.GMAIL_ALLOWED_EMAIL?.trim().toLowerCase();
    if (!allowed || profile.email.toLowerCase() !== allowed) throw new Error(`This JobFinder instance only accepts ${allowed ?? "the configured Gmail account"}.`);
    await getEmailAutomationStore().upsertConnection({
      email: profile.email,
      googleSubject: profile.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1_000).toISOString(),
      scopes: tokens.scope?.split(" ").filter(Boolean) ?? googleScopes,
    });
    const response = NextResponse.redirect(new URL("/?gmail=connected", url.origin));
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to connect Gmail." }, { status: 400 });
  }
}

