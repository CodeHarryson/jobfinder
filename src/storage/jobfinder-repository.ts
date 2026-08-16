import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JobPosting, SourceKind, TargetCompany, TargetSource } from "../domain/opportunity.ts";

type CompanyRow = { id: string; name: string; domain: string; priority: string; role_keywords: string; event_keywords: string; created_at: string };
type SourceRow = { id: string; company_id: string; kind: string; url: string; enabled: number; scan_cron: string };
type JobRow = {
  id: string; company_id: string; source_id: string; source_url: string; canonical_url: string; application_url: string;
  title: string; description: string; locations: string; employment_type: string; first_seen_at: string; last_seen_at: string;
  content_fingerprint: string; extraction_confidence: number;
};

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
        extraction_confidence REAL NOT NULL, UNIQUE(company_id, canonical_url)
      );
      CREATE TABLE IF NOT EXISTS scan_runs (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
        target_count INTEGER NOT NULL, job_count INTEGER NOT NULL, failure_count INTEGER NOT NULL, failures TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS job_postings_last_seen_idx ON job_postings(last_seen_at DESC);
    `);
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
    return (this.db.prepare("SELECT * FROM job_postings ORDER BY last_seen_at DESC, title").all() as JobRow[]).map((row) => ({
      kind: "JOB", id: row.id, companyId: row.company_id, sourceId: row.source_id, sourceUrl: row.source_url,
      canonicalUrl: row.canonical_url, applicationUrl: row.application_url, title: row.title, description: row.description,
      locations: JSON.parse(row.locations) as string[], employmentType: row.employment_type as JobPosting["employmentType"],
      firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, contentFingerprint: row.content_fingerprint,
      extractionConfidence: row.extraction_confidence,
    }));
  }

  saveJobs(jobs: JobPosting[]): JobPosting[] {
    const statement = this.db.prepare(`INSERT INTO job_postings(
      id,company_id,source_id,source_url,canonical_url,application_url,title,description,locations,employment_type,
      first_seen_at,last_seen_at,content_fingerprint,extraction_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(company_id,canonical_url) DO UPDATE SET source_id=excluded.source_id,source_url=excluded.source_url,
      application_url=excluded.application_url,title=excluded.title,description=excluded.description,locations=excluded.locations,
      employment_type=excluded.employment_type,last_seen_at=excluded.last_seen_at,content_fingerprint=excluded.content_fingerprint,
      extraction_confidence=excluded.extraction_confidence`);
    for (const job of jobs) statement.run(
      job.id, job.companyId, job.sourceId, job.sourceUrl, job.canonicalUrl, job.applicationUrl, job.title, job.description,
      JSON.stringify(job.locations), job.employmentType, job.firstSeenAt, job.lastSeenAt, job.contentFingerprint, job.extractionConfidence,
    );
    return jobs;
  }

  recordScan(input: { startedAt: string; finishedAt: string; targetCount: number; jobCount: number; failures: unknown[] }) {
    this.db.prepare("INSERT INTO scan_runs(id,started_at,finished_at,target_count,job_count,failure_count,failures) VALUES(?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), input.startedAt, input.finishedAt, input.targetCount, input.jobCount, input.failures.length, JSON.stringify(input.failures));
  }

  close() { this.db.close(); }
}

let repository: JobFinderRepository | undefined;

export function getRepository(): JobFinderRepository {
  repository ??= new JobFinderRepository(process.env.JOBFINDER_DB_PATH || join(process.cwd(), "data", "jobfinder.sqlite"));
  return repository;
}
