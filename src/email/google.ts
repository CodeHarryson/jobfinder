import type { GmailMessage } from "./types.ts";

const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");
  return { clientId, clientSecret };
}

export function googleRedirectUri(origin: string) {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${origin}/api/google/callback`;
}

export function googleAuthorizationUrl(origin: string, state: string) {
  const { clientId } = credentials();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: googleRedirectUri(origin), response_type: "code", access_type: "offline", prompt: "consent", scope: scopes.join(" "), state }).toString();
  return url;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

async function tokenRequest(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  if (!response.ok) throw new Error(`Google token request failed (${response.status}).`);
  return response.json() as Promise<TokenResponse>;
}

export function exchangeGoogleCode(code: string, origin: string) {
  const { clientId, clientSecret } = credentials();
  return tokenRequest(new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleRedirectUri(origin), grant_type: "authorization_code" }));
}

export function refreshGoogleToken(refreshToken: string) {
  const { clientId, clientSecret } = credentials();
  return tokenRequest(new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }));
}

export async function googleProfile(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google profile request failed (${response.status}).`);
  return response.json() as Promise<{ sub: string; email: string }>;
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailApiMessage = { id: string; threadId: string; internalDate?: string; snippet?: string; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } };

function bodyText(part?: GmailPart): string {
  if (!part) return "";
  const own = part.mimeType === "text/plain" && part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  return [own, ...(part.parts ?? []).map(bodyText)].filter(Boolean).join("\n").slice(0, 50_000);
}

export async function listRelevantGmailMessages(accessToken: string): Promise<GmailMessage[]> {
  const query = 'newer_than:30d ("application" OR "interview" OR "assessment" OR "coding challenge" OR "job offer")';
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.search = new URLSearchParams({ q: query, maxResults: "100" }).toString();
  const list = await fetch(listUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!list.ok) throw new Error(`Gmail list failed (${list.status}).`);
  const ids = (await list.json() as { messages?: Array<{ id: string }> }).messages ?? [];
  return Promise.all(ids.map(async ({ id }) => {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Gmail message fetch failed (${response.status}).`);
    const message = await response.json() as GmailApiMessage;
    const header = (name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? "";
    return { id: message.id, threadId: message.threadId, from: header("from"), subject: header("subject"), receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(), snippet: message.snippet ?? "", bodyText: bodyText(message.payload) };
  }));
}

export const googleScopes = scopes;

