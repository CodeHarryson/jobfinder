import { Pool } from "@neondatabase/serverless";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import type { EmailClassification, GmailMessage, GoogleConnection } from "./types.ts";

type Row = Record<string, unknown>;

export class EmailAutomationStore {
  private readonly pool: Pool;
  private migrated = false;

  constructor(connectionString: string) { this.pool = new Pool({ connectionString }); }

  private async db() {
    if (!this.migrated) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS google_connections(
          id text PRIMARY KEY,email text NOT NULL UNIQUE,google_subject text NOT NULL UNIQUE,
          access_token_encrypted text NOT NULL,refresh_token_encrypted text NOT NULL,
          access_token_expires_at timestamptz NOT NULL,scopes jsonb NOT NULL,
          last_synced_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS application_email_updates(
          id text PRIMARY KEY,connection_id text NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
          provider_message_id text NOT NULL,thread_id text NOT NULL,sender text NOT NULL,subject text NOT NULL,
          received_at timestamptz NOT NULL,snippet text NOT NULL,status text NOT NULL,confidence double precision NOT NULL,
          evidence jsonb NOT NULL,commitment_kind text,scheduled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(connection_id,provider_message_id)
        );
        CREATE TABLE IF NOT EXISTS preparation_block_proposals(
          id text PRIMARY KEY,email_update_id text NOT NULL REFERENCES application_email_updates(id) ON DELETE CASCADE,
          kind text NOT NULL,commitment_at timestamptz NOT NULL,blocks jsonb NOT NULL,status text NOT NULL DEFAULT 'PROPOSED',
          calendar_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(email_update_id)
        );
        CREATE INDEX IF NOT EXISTS application_email_updates_received_idx ON application_email_updates(received_at DESC);
        CREATE INDEX IF NOT EXISTS preparation_block_proposals_status_idx ON preparation_block_proposals(status,commitment_at);
      `);
      this.migrated = true;
    }
    return this.pool;
  }

  async upsertConnection(input: { email: string; googleSubject: string; accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] }) {
    const result = await (await this.db()).query(`
      INSERT INTO google_connections(id,email,google_subject,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,scopes)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT(email) DO UPDATE SET google_subject=excluded.google_subject,access_token_encrypted=excluded.access_token_encrypted,
        refresh_token_encrypted=excluded.refresh_token_encrypted,access_token_expires_at=excluded.access_token_expires_at,
        scopes=excluded.scopes,updated_at=now()
      RETURNING id
    `, [crypto.randomUUID(), input.email.toLowerCase(), input.googleSubject, encryptSecret(input.accessToken), encryptSecret(input.refreshToken), input.expiresAt, JSON.stringify(input.scopes)]);
    return String((result.rows[0] as Row).id);
  }

  private connection(row: Row): GoogleConnection {
    return { id: String(row.id), email: String(row.email), accessToken: decryptSecret(String(row.access_token_encrypted)), refreshToken: decryptSecret(String(row.refresh_token_encrypted)), accessTokenExpiresAt: new Date(String(row.access_token_expires_at)).toISOString(), scopes: row.scopes as string[], lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : null };
  }

  async listConnections() {
    const result = await (await this.db()).query("SELECT * FROM google_connections ORDER BY created_at");
    return result.rows.map((row: Row) => this.connection(row));
  }

  async updateAccessToken(id: string, accessToken: string, expiresAt: string) {
    await (await this.db()).query("UPDATE google_connections SET access_token_encrypted=$1,access_token_expires_at=$2,updated_at=now() WHERE id=$3", [encryptSecret(accessToken), expiresAt, id]);
  }

  async saveClassifiedMessage(connectionId: string, message: GmailMessage, classification: EmailClassification, blocks: Array<{ startsAt: string; endsAt: string }>) {
    const db = await this.db();
    const result = await db.query(`
      INSERT INTO application_email_updates(id,connection_id,provider_message_id,thread_id,sender,subject,received_at,snippet,status,confidence,evidence,commitment_kind,scheduled_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
      ON CONFLICT(connection_id,provider_message_id) DO NOTHING RETURNING id
    `, [crypto.randomUUID(), connectionId, message.id, message.threadId, message.from.slice(0, 500), message.subject.slice(0, 1_000), message.receivedAt, message.snippet.slice(0, 2_000), classification.status, classification.confidence, JSON.stringify(classification.evidence), classification.commitmentKind, classification.scheduledAt]);
    const updateId = result.rows[0] ? String((result.rows[0] as Row).id) : null;
    if (updateId && classification.commitmentKind && classification.scheduledAt && blocks.length) {
      await db.query("INSERT INTO preparation_block_proposals(id,email_update_id,kind,commitment_at,blocks) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(email_update_id) DO NOTHING", [crypto.randomUUID(), updateId, classification.commitmentKind, classification.scheduledAt, JSON.stringify(blocks)]);
    }
    return updateId !== null;
  }

  async markSynced(id: string, at: string) {
    await (await this.db()).query("UPDATE google_connections SET last_synced_at=$1,updated_at=now() WHERE id=$2", [at, id]);
  }

  async status() {
    const db = await this.db();
    const [connections, updates, proposals] = await Promise.all([
      db.query("SELECT email,last_synced_at,created_at FROM google_connections ORDER BY created_at"),
      db.query("SELECT status,count(*)::int count,max(received_at) latest FROM application_email_updates GROUP BY status ORDER BY status"),
      db.query("SELECT status,count(*)::int count FROM preparation_block_proposals GROUP BY status ORDER BY status"),
    ]);
    return { connections: connections.rows, updates: updates.rows, preparationProposals: proposals.rows };
  }
}

let store: EmailAutomationStore | undefined;
export function getEmailAutomationStore() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for email persistence.");
  return store ??= new EmailAutomationStore(connectionString);
}

