import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JobPosting, RecruitingEvent, SourceKind, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import type { DiscoveryHealth } from "./repository.ts";

type CompanyRow = { id: string; name: string; domain: string; priority: string; role_keywords: string; event_keywords: string; created_at: string };
type SourceRow = { id: string; company_id: string; kind: string; url: string; enabled: number; scan_cron: string };
type JobRow = {
  id: string; company_id: string; source_id: string; source_url: string; canonical_url: string; application_url: string;
  title: string; description: string; locations: string; employment_type: string; first_seen_at: string; last_seen_at: string;
  content_fingerprint: string; extraction_confidence: number;
};
export type DiscoveryChange = { id: string; jobId: string; companyId: string; kind: "NEW" | "UPDATED"; createdAt: string; readAt: string | null };
export type NotificationItem = DiscoveryChange & { companyName: string; jobTitle: string; applicationUrl: string };
export type NotificationDelivery = { id: string; notification: NotificationItem; attempts: number };

export class JobFinderRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath = ":memory:") {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS target_companies (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL UNIQUE,
        priority TEXT NOT NULL, role_keywords TEXT NOT NULL, event_keywords TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS target_sources (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, url TEXT NOT NULL, enabled INTEGER NOT NULL, scan_cron TEXT NOT NULL,
        UNIQUE(company_id, kind)
      );
      CREATE TABLE IF NOT EXISTS job_postings (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL, source_url TEXT NOT NULL, canonical_url TEXT NOT NULL, application_url TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL, locations TEXT NOT NULL, employment_type TEXT NOT NULL,
        first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, content_fingerprint TEXT NOT NULL,
        extraction_confidence REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, missed_scans INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, canonical_url)
      );
      CREATE TABLE IF NOT EXISTS recruiting_events (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL, source_url TEXT NOT NULL, canonical_url TEXT NOT NULL, registration_url TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL, event_type TEXT NOT NULL, starts_at TEXT, ends_at TEXT,
        timezone TEXT NOT NULL, format TEXT NOT NULL, location TEXT, registration_deadline TEXT, audience TEXT NOT NULL,
        status TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, content_fingerprint TEXT NOT NULL,
        extraction_confidence REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(company_id, canonical_url)
      );
      CREATE TABLE IF NOT EXISTS scan_runs (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
        target_count INTEGER NOT NULL, job_count INTEGER NOT NULL, failure_count INTEGER NOT NULL, failures TEXT NOT NULL,
        source_results TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS discovery_changes (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
        UNIQUE(job_id, kind, created_at)
      );
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id TEXT PRIMARY KEY, change_id TEXT NOT NULL REFERENCES discovery_changes(id) ON DELETE CASCADE,
        channel TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL, last_error TEXT, external_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(change_id, channel)
      );
      CREATE INDEX IF NOT EXISTS job_postings_last_seen_idx ON job_postings(last_seen_at DESC);
    `);
    const jobColumns = new Set((this.db.prepare("PRAGMA table_info(job_postings)").all() as Array<{ name: string }>).map(({ name }) => name));
    if (!jobColumns.has("active")) this.db.exec("ALTER TABLE job_postings ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    if (!jobColumns.has("missed_scans")) this.db.exec("ALTER TABLE job_postings ADD COLUMN missed_scans INTEGER NOT NULL DEFAULT 0");
    const scanColumns = new Set((this.db.prepare("PRAGMA table_info(scan_runs)").all() as Array<{ name: string }>).map(({ name }) => name));
    if (!scanColumns.has("source_results")) this.db.exec("ALTER TABLE scan_runs ADD COLUMN source_results TEXT NOT NULL DEFAULT '[]'");
  }

  listTargets(): TargetCompany[] {
    const companies = this.db.prepare("SELECT * FROM target_companies ORDER BY name COLLATE NOCASE").all() as CompanyRow[];
    const sourceStatement = this.db.prepare("SELECT * FROM target_sources WHERE company_id = ? ORDER BY kind");
    return companies.map((row) => ({
      id: row.id, name: row.name, domain: row.domain, priority: row.priority as TargetCompany["priority"],
      roleKeywords: JSON.parse(row.role_keywords) as string[], eventKeywords: JSON.parse(row.event_keywords) as string[],
      createdAt: row.created_at,
      sources: (sourceStatement.all(row.id) as SourceRow[]).map((source): TargetSource => ({
        id: source.id, kind: source.kind as SourceKind, url: source.url, enabled: Boolean(source.enabled), scanCron: source.scan_cron,
      })),
    }));
  }

  saveTarget(target: TargetCompany): TargetCompany {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO target_companies(id,name,domain,priority,role_keywords,event_keywords,created_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,domain=excluded.domain,priority=excluded.priority,
        role_keywords=excluded.role_keywords,event_keywords=excluded.event_keywords`).run(
        target.id, target.name, target.domain, target.priority, JSON.stringify(target.roleKeywords), JSON.stringify(target.eventKeywords), target.createdAt,
      );
      this.db.prepare("DELETE FROM target_sources WHERE company_id = ?").run(target.id);
      const insertSource = this.db.prepare("INSERT INTO target_sources(id,company_id,kind,url,enabled,scan_cron) VALUES(?,?,?,?,?,?)");
      for (const source of target.sources) insertSource.run(source.id, target.id, source.kind, source.url, source.enabled ? 1 : 0, source.scanCron);
      this.db.exec("COMMIT");
      return target;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveTargets(targets: TargetCompany[]): TargetCompany[] {
    return targets.map((target) => this.saveTarget(target));
  }

  deleteTarget(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM target_companies WHERE id = ?").run(id).changes) > 0;
  }

  listJobs(): JobPosting[] {
    return (this.db.prepare("SELECT * FROM job_postings WHERE active=1 ORDER BY last_seen_at DESC, title").all() as JobRow[]).map((row) => ({
      kind: "JOB", id: row.id, companyId: row.company_id, sourceId: row.source_id, sourceUrl: row.source_url,
      canonicalUrl: row.canonical_url, applicationUrl: row.application_url, title: row.title, description: row.description,
      locations: JSON.parse(row.locations) as string[], employmentType: row.employment_type as JobPosting["employmentType"],
      firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, contentFingerprint: row.content_fingerprint,
      extractionConfidence: row.extraction_confidence,
    }));
  }

  listEvents(): RecruitingEvent[] {
    const rows=this.db.prepare("SELECT * FROM recruiting_events WHERE active=1 ORDER BY starts_at IS NULL,starts_at,last_seen_at DESC").all() as Array<Record<string,unknown>>;
    return rows.map((row)=>({kind:"EVENT",id:String(row.id),companyId:String(row.company_id),sourceId:String(row.source_id),sourceUrl:String(row.source_url),canonicalUrl:String(row.canonical_url),registrationUrl:String(row.registration_url),title:String(row.title),description:String(row.description),eventType:row.event_type as RecruitingEvent["eventType"],startsAt:row.starts_at?String(row.starts_at):null,endsAt:row.ends_at?String(row.ends_at):null,timezone:String(row.timezone),format:row.format as RecruitingEvent["format"],location:row.location?String(row.location):null,registrationDeadline:row.registration_deadline?String(row.registration_deadline):null,audience:JSON.parse(String(row.audience)) as string[],status:row.status as RecruitingEvent["status"],firstSeenAt:String(row.first_seen_at),lastSeenAt:String(row.last_seen_at),contentFingerprint:String(row.content_fingerprint),extractionConfidence:Number(row.extraction_confidence)}));
  }

  saveEvent(event: RecruitingEvent): "NEW"|"UPDATED"|null {
    const existing=this.db.prepare("SELECT content_fingerprint,first_seen_at FROM recruiting_events WHERE company_id=? AND canonical_url=?").get(event.companyId,event.canonicalUrl) as {content_fingerprint:string;first_seen_at:string}|undefined;
    this.db.prepare(`INSERT INTO recruiting_events(id,company_id,source_id,source_url,canonical_url,registration_url,title,description,event_type,starts_at,ends_at,timezone,format,location,registration_deadline,audience,status,first_seen_at,last_seen_at,content_fingerprint,extraction_confidence,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(company_id,canonical_url) DO UPDATE SET source_id=excluded.source_id,source_url=excluded.source_url,registration_url=excluded.registration_url,title=excluded.title,description=excluded.description,event_type=excluded.event_type,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,format=excluded.format,location=excluded.location,registration_deadline=excluded.registration_deadline,audience=excluded.audience,status=excluded.status,last_seen_at=excluded.last_seen_at,content_fingerprint=excluded.content_fingerprint,extraction_confidence=excluded.extraction_confidence,active=1`).run(event.id,event.companyId,event.sourceId,event.sourceUrl,event.canonicalUrl,event.registrationUrl,event.title,event.description,event.eventType,event.startsAt,event.endsAt,event.timezone,event.format,event.location,event.registrationDeadline,JSON.stringify(event.audience),event.status,existing?.first_seen_at??event.firstSeenAt,event.lastSeenAt,event.contentFingerprint,event.extractionConfidence);
    return !existing?"NEW":existing.content_fingerprint!==event.contentFingerprint?"UPDATED":null;
  }

  saveJobs(jobs: JobPosting[], scannedSourceIds: string[] = []): DiscoveryChange[] {
    const statement = this.db.prepare(`INSERT INTO job_postings(
      id,company_id,source_id,source_url,canonical_url,application_url,title,description,locations,employment_type,
      first_seen_at,last_seen_at,content_fingerprint,extraction_confidence,active,missed_scans) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)
      ON CONFLICT(company_id,canonical_url) DO UPDATE SET source_id=excluded.source_id,source_url=excluded.source_url,
      application_url=excluded.application_url,title=excluded.title,description=excluded.description,locations=excluded.locations,
      employment_type=excluded.employment_type,last_seen_at=excluded.last_seen_at,content_fingerprint=excluded.content_fingerprint,
      extraction_confidence=excluded.extraction_confidence,active=1,missed_scans=0`);
    const find = this.db.prepare("SELECT id, content_fingerprint FROM job_postings WHERE company_id = ? AND canonical_url = ?");
    const insertChange = this.db.prepare("INSERT INTO discovery_changes(id,job_id,company_id,kind,created_at,read_at) VALUES(?,?,?,?,?,NULL)");
    const changes: DiscoveryChange[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const sourceId of scannedSourceIds) {
        const seenUrls = new Set(jobs.filter((job) => job.sourceId === sourceId).map((job) => job.canonicalUrl));
        const existing = this.db.prepare("SELECT canonical_url FROM job_postings WHERE source_id=? AND active=1").all(sourceId) as Array<{ canonical_url: string }>;
        const miss = this.db.prepare("UPDATE job_postings SET missed_scans=missed_scans+1,active=CASE WHEN missed_scans+1>=2 THEN 0 ELSE active END WHERE source_id=? AND canonical_url=?");
        for (const row of existing) if (!seenUrls.has(row.canonical_url)) miss.run(sourceId, row.canonical_url);
      }
      for (const job of jobs) {
        const existing = find.get(job.companyId, job.canonicalUrl) as { id: string; content_fingerprint: string } | undefined;
        statement.run(job.id, job.companyId, job.sourceId, job.sourceUrl, job.canonicalUrl, job.applicationUrl, job.title, job.description,
          JSON.stringify(job.locations), job.employmentType, existing ? this.listJobFirstSeen(existing.id) : job.firstSeenAt, job.lastSeenAt, job.contentFingerprint, job.extractionConfidence);
        const kind = !existing ? "NEW" : existing.content_fingerprint !== job.contentFingerprint ? "UPDATED" : null;
        if (kind) {
          const change = { id: crypto.randomUUID(), jobId: existing?.id ?? job.id, companyId: job.companyId, kind, createdAt: job.lastSeenAt, readAt: null } satisfies DiscoveryChange;
          insertChange.run(change.id, change.jobId, change.companyId, change.kind, change.createdAt);
          changes.push(change);
        }
      }
      this.db.exec("COMMIT");
      return changes;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private listJobFirstSeen(id: string): string {
    return (this.db.prepare("SELECT first_seen_at FROM job_postings WHERE id = ?").get(id) as { first_seen_at: string }).first_seen_at;
  }

  listDiscoveryChanges(unreadOnly = false): DiscoveryChange[] {
    const where = unreadOnly ? "WHERE read_at IS NULL" : "";
    return (this.db.prepare(`SELECT id,job_id,company_id,kind,created_at,read_at FROM discovery_changes ${where} ORDER BY created_at DESC`).all() as Array<{ id: string; job_id: string; company_id: string; kind: string; created_at: string; read_at: string | null }>).map((row) => ({
      id: row.id, jobId: row.job_id, companyId: row.company_id, kind: row.kind as DiscoveryChange["kind"], createdAt: row.created_at, readAt: row.read_at,
    }));
  }

  listNotifications(unreadOnly = false): NotificationItem[] {
    const where = unreadOnly ? "WHERE dc.read_at IS NULL" : "";
    return (this.db.prepare(`SELECT dc.id,dc.job_id,dc.company_id,dc.kind,dc.created_at,dc.read_at,
      tc.name AS company_name,jp.title AS job_title,jp.application_url
      FROM discovery_changes dc JOIN target_companies tc ON tc.id=dc.company_id JOIN job_postings jp ON jp.id=dc.job_id
      ${where} ORDER BY dc.created_at DESC`).all() as Array<{ id: string; job_id: string; company_id: string; kind: string; created_at: string; read_at: string | null; company_name: string; job_title: string; application_url: string }>).map((row) => ({
      id: row.id, jobId: row.job_id, companyId: row.company_id, kind: row.kind as DiscoveryChange["kind"], createdAt: row.created_at,
      readAt: row.read_at, companyName: row.company_name, jobTitle: row.job_title, applicationUrl: row.application_url,
    }));
  }

  markNotificationRead(id: string): boolean {
    return Number(this.db.prepare("UPDATE discovery_changes SET read_at=COALESCE(read_at,?) WHERE id=?").run(new Date().toISOString(), id).changes) > 0;
  }

  markAllNotificationsRead(): number {
    return Number(this.db.prepare("UPDATE discovery_changes SET read_at=? WHERE read_at IS NULL").run(new Date().toISOString()).changes);
  }

  deleteNotification(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM discovery_changes WHERE id=?").run(id).changes) > 0;
  }

  enqueueDiscordDeliveries(changes: DiscoveryChange[]): number {
    const statement = this.db.prepare(`INSERT INTO notification_deliveries(id,change_id,channel,status,attempts,next_attempt_at,created_at,updated_at)
      VALUES(?,?,'DISCORD','PENDING',0,?,?,?) ON CONFLICT(change_id,channel) DO NOTHING`);
    let created = 0;
    for (const change of changes) {
      const now = new Date().toISOString();
      created += Number(statement.run(crypto.randomUUID(), change.id, now, now, now).changes);
    }
    return created;
  }

  claimDiscordDeliveries(limit = 10, now = new Date()): NotificationDelivery[] {
    const rows = this.db.prepare(`SELECT nd.id,nd.attempts,dc.id AS change_id,dc.job_id,dc.company_id,dc.kind,dc.created_at,dc.read_at,
      tc.name AS company_name,jp.title AS job_title,jp.application_url
      FROM notification_deliveries nd JOIN discovery_changes dc ON dc.id=nd.change_id
      JOIN target_companies tc ON tc.id=dc.company_id JOIN job_postings jp ON jp.id=dc.job_id
      WHERE nd.channel='DISCORD' AND nd.status IN ('PENDING','FAILED') AND nd.next_attempt_at<=?
      AND jp.active=1 AND jp.missed_scans=0 ORDER BY nd.created_at LIMIT ?`).all(now.toISOString(), limit) as Array<{ id: string; attempts: number; change_id: string; job_id: string; company_id: string; kind: string; created_at: string; read_at: string | null; company_name: string; job_title: string; application_url: string }>;
    const claim = this.db.prepare("UPDATE notification_deliveries SET status='SENDING',attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('PENDING','FAILED')");
    return rows.flatMap((row) => Number(claim.run(now.toISOString(), row.id).changes) ? [{
      id: row.id, attempts: row.attempts + 1, notification: { id: row.change_id, jobId: row.job_id, companyId: row.company_id,
        kind: row.kind as DiscoveryChange["kind"], createdAt: row.created_at, readAt: row.read_at, companyName: row.company_name,
        jobTitle: row.job_title, applicationUrl: row.application_url },
    }] : []);
  }

  completeDiscordDelivery(id: string, externalId: string): void {
    this.db.prepare("UPDATE notification_deliveries SET status='SENT',external_id=?,last_error=NULL,updated_at=? WHERE id=?")
      .run(externalId, new Date().toISOString(), id);
  }

  failDiscordDelivery(id: string, attempts: number, error: string): void {
    const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
    const nextAttemptAt = new Date(Date.now() + delays[Math.min(attempts - 1, delays.length - 1)]).toISOString();
    this.db.prepare("UPDATE notification_deliveries SET status='FAILED',next_attempt_at=?,last_error=?,updated_at=? WHERE id=?")
      .run(nextAttemptAt, error.slice(0, 500), new Date().toISOString(), id);
  }

  recordScan(input: { startedAt: string; finishedAt: string; targetCount: number; jobCount: number; failures: unknown[]; sourceResults?: unknown[] }) {
    this.db.prepare("INSERT INTO scan_runs(id,started_at,finished_at,target_count,job_count,failure_count,failures,source_results) VALUES(?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), input.startedAt, input.finishedAt, input.targetCount, input.jobCount, input.failures.length, JSON.stringify(input.failures), JSON.stringify(input.sourceResults ?? []));
  }

  getDiscoveryHealth(): DiscoveryHealth | null {
    const row = this.db.prepare("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
    return row ? { startedAt: String(row.started_at), finishedAt: String(row.finished_at), targetCount: Number(row.target_count),
      jobCount: Number(row.job_count), failureCount: Number(row.failure_count), failures: JSON.parse(String(row.failures)) as unknown[],
      sourceResults: JSON.parse(String(row.source_results)) as unknown[] } : null;
  }

  close() { this.db.close(); }
}
