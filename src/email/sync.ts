import { classifyApplicationEmail, proposePreparationBlocks } from "./classify-application-email.ts";
import { listRelevantGmailMessages, refreshGoogleToken } from "./google.ts";
import { getEmailAutomationStore } from "./store.ts";
import type { GoogleConnection } from "./types.ts";

async function accessToken(connection: GoogleConnection) {
  if (new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 60_000) return connection.accessToken;
  const refreshed = await refreshGoogleToken(connection.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1_000).toISOString();
  await getEmailAutomationStore().updateAccessToken(connection.id, refreshed.access_token, expiresAt);
  return refreshed.access_token;
}

export async function syncGmailConnection(connection: GoogleConnection) {
  const store = getEmailAutomationStore();
  const messages = await listRelevantGmailMessages(await accessToken(connection));
  let detected = 0;
  let inserted = 0;
  for (const message of messages) {
    const classification = classifyApplicationEmail(message);
    if (!classification) continue;
    detected += 1;
    const blocks = classification.commitmentKind && classification.scheduledAt ? proposePreparationBlocks(classification.commitmentKind, classification.scheduledAt) : [];
    if (await store.saveClassifiedMessage(connection.id, message, classification, blocks)) inserted += 1;
  }
  const syncedAt = new Date().toISOString();
  await store.markSynced(connection.id, syncedAt);
  return { connectionId: connection.id, email: connection.email, examined: messages.length, detected, inserted, syncedAt };
}

export async function syncAllGmailConnections() {
  const connections = await getEmailAutomationStore().listConnections();
  const results = [];
  for (const connection of connections) results.push(await syncGmailConnection(connection));
  return results;
}

