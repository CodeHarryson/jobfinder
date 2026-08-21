import { Pool, type PoolClient } from "@neondatabase/serverless";
import type { JobPosting, RecruitingEvent, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import type { Repository } from "./repository.ts";
import type { DiscoveryHealth } from "./repository.ts";
import type { DiscoveryChange, NotificationDelivery, NotificationItem } from "./jobfinder-repository.ts";

type Row = Record<string, unknown>;

export class PostgresRepository implements Repository {
  private readonly pool: Pool;
  private migrated = false;

  constructor(connectionString: string) { this.pool = new Pool({ connectionString }); }

  private async db() {
    if (!this.migrated) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS target_companies(id text PRIMARY KEY,name text NOT NULL,domain text NOT NULL UNIQUE,priority text NOT NULL,role_keywords jsonb NOT NULL,event_keywords jsonb NOT NULL,created_at timestamptz NOT NULL);
        CREATE TABLE IF NOT EXISTS target_sources(id text PRIMARY KEY,company_id text NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,kind text NOT NULL,url text NOT NULL,enabled boolean NOT NULL,scan_cron text NOT NULL,UNIQUE(company_id,kind));
        CREATE TABLE IF NOT EXISTS job_postings(id text PRIMARY KEY,company_id text NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,source_id text NOT NULL,source_url text NOT NULL,canonical_url text NOT NULL,application_url text NOT NULL,title text NOT NULL,description text NOT NULL,locations jsonb NOT NULL,employment_type text NOT NULL,first_seen_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,content_fingerprint text NOT NULL,extraction_confidence double precision NOT NULL,UNIQUE(company_id,canonical_url));
        CREATE TABLE IF NOT EXISTS recruiting_events(id text PRIMARY KEY,company_id text NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,source_id text NOT NULL,source_url text NOT NULL,canonical_url text NOT NULL,registration_url text NOT NULL,title text NOT NULL,description text NOT NULL,event_type text NOT NULL,starts_at timestamptz,ends_at timestamptz,timezone text NOT NULL,format text NOT NULL,location text,registration_deadline timestamptz,audience jsonb NOT NULL,status text NOT NULL,first_seen_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,content_fingerprint text NOT NULL,extraction_confidence double precision NOT NULL,active boolean NOT NULL DEFAULT true,UNIQUE(company_id,canonical_url));
        CREATE TABLE IF NOT EXISTS scan_runs(id text PRIMARY KEY,started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL,target_count integer NOT NULL,job_count integer NOT NULL,failure_count integer NOT NULL,failures jsonb NOT NULL);
        CREATE TABLE IF NOT EXISTS discovery_changes(id text PRIMARY KEY,job_id text NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,company_id text NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,kind text NOT NULL,created_at timestamptz NOT NULL,read_at timestamptz,UNIQUE(job_id,kind,created_at));
        CREATE TABLE IF NOT EXISTS notification_deliveries(id text PRIMARY KEY,change_id text NOT NULL REFERENCES discovery_changes(id) ON DELETE CASCADE,channel text NOT NULL,status text NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL,last_error text,external_id text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(change_id,channel));
        CREATE INDEX IF NOT EXISTS job_postings_last_seen_idx ON job_postings(last_seen_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS target_companies_name_unique_idx ON target_companies(lower(name));
        ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
        ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS missed_scans integer NOT NULL DEFAULT 0;
        ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS source_results jsonb NOT NULL DEFAULT '[]'::jsonb;
      `);
      this.migrated = true;
    }
    return this.pool;
  }

  async listTargets(): Promise<TargetCompany[]> {
    const db = await this.db();
    const [companies, sources] = await Promise.all([db.query("SELECT * FROM target_companies ORDER BY lower(name)"), db.query("SELECT * FROM target_sources ORDER BY kind")]);
    return companies.rows.map((row: Row) => ({ id: String(row.id), name: String(row.name), domain: String(row.domain), priority: row.priority as TargetCompany["priority"], roleKeywords: row.role_keywords as string[], eventKeywords: row.event_keywords as string[], createdAt: new Date(String(row.created_at)).toISOString(), sources: sources.rows.filter((source: Row) => source.company_id === row.id).map((source: Row): TargetSource => ({ id: String(source.id), kind: source.kind as TargetSource["kind"], url: String(source.url), enabled: Boolean(source.enabled), scanCron: String(source.scan_cron) })) }));
  }

  async saveTarget(target: TargetCompany): Promise<TargetCompany> {
    const db = await this.db(); const client = await db.connect();
    try { await client.query("BEGIN"); await this.saveTargetWithClient(client, target); await client.query("COMMIT"); return target; }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  private async saveTargetWithClient(client: PoolClient, target: TargetCompany) {
    await client.query(`INSERT INTO target_companies(id,name,domain,priority,role_keywords,event_keywords,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,domain=excluded.domain,priority=excluded.priority,role_keywords=excluded.role_keywords,event_keywords=excluded.event_keywords`, [target.id,target.name,target.domain,target.priority,JSON.stringify(target.roleKeywords),JSON.stringify(target.eventKeywords),target.createdAt]);
    await client.query("DELETE FROM target_sources WHERE company_id=$1", [target.id]);
    for (const source of target.sources) await client.query("INSERT INTO target_sources(id,company_id,kind,url,enabled,scan_cron) VALUES($1,$2,$3,$4,$5,$6)", [source.id,target.id,source.kind,source.url,source.enabled,source.scanCron]);
  }

  async saveTargets(targets: TargetCompany[]) { for (const target of targets) await this.saveTarget(target); return targets; }
  async deleteTarget(id: string) { return (await (await this.db()).query("DELETE FROM target_companies WHERE id=$1", [id])).rowCount === 1; }

  async listJobs(): Promise<JobPosting[]> {
    const result = await (await this.db()).query("SELECT * FROM job_postings WHERE active=true ORDER BY last_seen_at DESC,title");
    return result.rows.map((row: Row) => this.job(row));
  }

  private job(row: Row): JobPosting { return { kind:"JOB",id:String(row.id),companyId:String(row.company_id),sourceId:String(row.source_id),sourceUrl:String(row.source_url),canonicalUrl:String(row.canonical_url),applicationUrl:String(row.application_url),title:String(row.title),description:String(row.description),locations:row.locations as string[],employmentType:row.employment_type as JobPosting["employmentType"],firstSeenAt:new Date(String(row.first_seen_at)).toISOString(),lastSeenAt:new Date(String(row.last_seen_at)).toISOString(),contentFingerprint:String(row.content_fingerprint),extractionConfidence:Number(row.extraction_confidence) }; }

  private event(row: Row): RecruitingEvent { return { kind:"EVENT",id:String(row.id),companyId:String(row.company_id),sourceId:String(row.source_id),sourceUrl:String(row.source_url),canonicalUrl:String(row.canonical_url),registrationUrl:String(row.registration_url),title:String(row.title),description:String(row.description),eventType:row.event_type as RecruitingEvent["eventType"],startsAt:row.starts_at?new Date(String(row.starts_at)).toISOString():null,endsAt:row.ends_at?new Date(String(row.ends_at)).toISOString():null,timezone:String(row.timezone),format:row.format as RecruitingEvent["format"],location:row.location?String(row.location):null,registrationDeadline:row.registration_deadline?new Date(String(row.registration_deadline)).toISOString():null,audience:row.audience as string[],status:row.status as RecruitingEvent["status"],firstSeenAt:new Date(String(row.first_seen_at)).toISOString(),lastSeenAt:new Date(String(row.last_seen_at)).toISOString(),contentFingerprint:String(row.content_fingerprint),extractionConfidence:Number(row.extraction_confidence) }; }

  async listEvents(): Promise<RecruitingEvent[]> { const result=await(await this.db()).query("SELECT * FROM recruiting_events WHERE active=true ORDER BY starts_at NULLS LAST,last_seen_at DESC");return result.rows.map((row:Row)=>this.event(row)); }

  async saveEvent(event: RecruitingEvent): Promise<"NEW"|"UPDATED"|null> { const db=await this.db();const found=await db.query("SELECT content_fingerprint,first_seen_at FROM recruiting_events WHERE company_id=$1 AND canonical_url=$2",[event.companyId,event.canonicalUrl]);const existing=found.rows[0] as Row|undefined;await db.query(`INSERT INTO recruiting_events(id,company_id,source_id,source_url,canonical_url,registration_url,title,description,event_type,starts_at,ends_at,timezone,format,location,registration_deadline,audience,status,first_seen_at,last_seen_at,content_fingerprint,extraction_confidence,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,true) ON CONFLICT(company_id,canonical_url) DO UPDATE SET source_id=excluded.source_id,source_url=excluded.source_url,registration_url=excluded.registration_url,title=excluded.title,description=excluded.description,event_type=excluded.event_type,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,format=excluded.format,location=excluded.location,registration_deadline=excluded.registration_deadline,audience=excluded.audience,status=excluded.status,last_seen_at=excluded.last_seen_at,content_fingerprint=excluded.content_fingerprint,extraction_confidence=excluded.extraction_confidence,active=true`,[event.id,event.companyId,event.sourceId,event.sourceUrl,event.canonicalUrl,event.registrationUrl,event.title,event.description,event.eventType,event.startsAt,event.endsAt,event.timezone,event.format,event.location,event.registrationDeadline,JSON.stringify(event.audience),event.status,existing?.first_seen_at??event.firstSeenAt,event.lastSeenAt,event.contentFingerprint,event.extractionConfidence]);return !existing?"NEW":existing.content_fingerprint!==event.contentFingerprint?"UPDATED":null; }

  async saveJobs(jobs: JobPosting[], scannedSourceIds: string[] = []): Promise<DiscoveryChange[]> {
    const db = await this.db(); const client = await db.connect(); const changes: DiscoveryChange[]=[];
    try { await client.query("BEGIN");
      for (const sourceId of scannedSourceIds) {
        const seenUrls = jobs.filter((job) => job.sourceId === sourceId).map((job) => job.canonicalUrl);
        await client.query(`UPDATE job_postings SET missed_scans=missed_scans+1,
          active=CASE WHEN missed_scans+1>=2 THEN false ELSE active END
          WHERE source_id=$1 AND active=true AND NOT (canonical_url=ANY($2::text[]))`, [sourceId, seenUrls]);
      }
      for (const job of jobs) {
        const found=await client.query("SELECT id,content_fingerprint,first_seen_at FROM job_postings WHERE company_id=$1 AND canonical_url=$2 FOR UPDATE",[job.companyId,job.canonicalUrl]); const existing=found.rows[0] as Row|undefined;
        await client.query(`INSERT INTO job_postings(id,company_id,source_id,source_url,canonical_url,application_url,title,description,locations,employment_type,first_seen_at,last_seen_at,content_fingerprint,extraction_confidence,active,missed_scans) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,true,0) ON CONFLICT(company_id,canonical_url) DO UPDATE SET source_id=excluded.source_id,source_url=excluded.source_url,application_url=excluded.application_url,title=excluded.title,description=excluded.description,locations=excluded.locations,employment_type=excluded.employment_type,last_seen_at=excluded.last_seen_at,content_fingerprint=excluded.content_fingerprint,extraction_confidence=excluded.extraction_confidence,active=true,missed_scans=0`,[job.id,job.companyId,job.sourceId,job.sourceUrl,job.canonicalUrl,job.applicationUrl,job.title,job.description,JSON.stringify(job.locations),job.employmentType,existing?.first_seen_at??job.firstSeenAt,job.lastSeenAt,job.contentFingerprint,job.extractionConfidence]);
        const kind=!existing?"NEW":existing.content_fingerprint!==job.contentFingerprint?"UPDATED":null;
        if(kind){const change={id:crypto.randomUUID(),jobId:String(existing?.id??job.id),companyId:job.companyId,kind,createdAt:job.lastSeenAt,readAt:null} satisfies DiscoveryChange;await client.query("INSERT INTO discovery_changes(id,job_id,company_id,kind,created_at) VALUES($1,$2,$3,$4,$5)",[change.id,change.jobId,change.companyId,change.kind,change.createdAt]);changes.push(change);}
      }
      await client.query("COMMIT"); return changes;
    } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
  }

  private notification(row: Row): NotificationItem { return {id:String(row.id),jobId:String(row.job_id),companyId:String(row.company_id),kind:row.kind as DiscoveryChange["kind"],createdAt:new Date(String(row.created_at)).toISOString(),readAt:row.read_at?new Date(String(row.read_at)).toISOString():null,companyName:String(row.company_name),jobTitle:String(row.job_title),applicationUrl:String(row.application_url)}; }
  async listNotifications(unreadOnly=false){const result=await(await this.db()).query(`SELECT dc.*,tc.name company_name,jp.title job_title,jp.application_url FROM discovery_changes dc JOIN target_companies tc ON tc.id=dc.company_id JOIN job_postings jp ON jp.id=dc.job_id ${unreadOnly?"WHERE dc.read_at IS NULL":""} ORDER BY dc.created_at DESC`);return result.rows.map((row:Row)=>this.notification(row));}
  async markNotificationRead(id:string){return (await(await this.db()).query("UPDATE discovery_changes SET read_at=COALESCE(read_at,now()) WHERE id=$1",[id])).rowCount===1;}
  async markAllNotificationsRead(){return (await(await this.db()).query("UPDATE discovery_changes SET read_at=now() WHERE read_at IS NULL")).rowCount??0;}
  async deleteNotification(id:string){return (await(await this.db()).query("DELETE FROM discovery_changes WHERE id=$1",[id])).rowCount===1;}
  async enqueueDiscordDeliveries(changes:DiscoveryChange[]){const db=await this.db();let count=0;for(const change of changes){count+=(await db.query("INSERT INTO notification_deliveries(id,change_id,channel,status,next_attempt_at,created_at,updated_at) VALUES($1,$2,'DISCORD','PENDING',now(),now(),now()) ON CONFLICT(change_id,channel) DO NOTHING",[crypto.randomUUID(),change.id])).rowCount??0;}return count;}
  async claimDiscordDeliveries(limit=10,now=new Date()):Promise<NotificationDelivery[]>{const db=await this.db();const result=await db.query(`WITH claimed AS (SELECT id FROM notification_deliveries WHERE channel='DISCORD' AND status IN ('PENDING','FAILED') AND next_attempt_at<=$1 ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED), updated AS (UPDATE notification_deliveries nd SET status='SENDING',attempts=nd.attempts+1,updated_at=$1 FROM claimed WHERE nd.id=claimed.id RETURNING nd.*) SELECT u.id,u.attempts,dc.id change_id,dc.job_id,dc.company_id,dc.kind,dc.created_at,dc.read_at,tc.name company_name,jp.title job_title,jp.application_url FROM updated u JOIN discovery_changes dc ON dc.id=u.change_id JOIN target_companies tc ON tc.id=dc.company_id JOIN job_postings jp ON jp.id=dc.job_id`,[now.toISOString(),limit]);return result.rows.map((row:Row)=>({id:String(row.id),attempts:Number(row.attempts),notification:this.notification({...row,id:row.change_id})}));}
  async completeDiscordDelivery(id:string,externalId:string){await(await this.db()).query("UPDATE notification_deliveries SET status='SENT',external_id=$1,last_error=NULL,updated_at=now() WHERE id=$2",[externalId,id]);}
  async failDiscordDelivery(id:string,attempts:number,error:string){const delays=[60_000,300_000,900_000,3_600_000];const next=new Date(Date.now()+delays[Math.min(attempts-1,delays.length-1)]);await(await this.db()).query("UPDATE notification_deliveries SET status='FAILED',next_attempt_at=$1,last_error=$2,updated_at=now() WHERE id=$3",[next.toISOString(),error.slice(0,500),id]);}
  async recordScan(input:{startedAt:string;finishedAt:string;targetCount:number;jobCount:number;failures:unknown[];sourceResults?:unknown[]}){await(await this.db()).query("INSERT INTO scan_runs(id,started_at,finished_at,target_count,job_count,failure_count,failures,source_results) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",[crypto.randomUUID(),input.startedAt,input.finishedAt,input.targetCount,input.jobCount,input.failures.length,JSON.stringify(input.failures),JSON.stringify(input.sourceResults??[])]);}
  async getDiscoveryHealth():Promise<DiscoveryHealth|null>{const result=await(await this.db()).query("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1");const row=result.rows[0] as Row|undefined;return row?{startedAt:new Date(String(row.started_at)).toISOString(),finishedAt:new Date(String(row.finished_at)).toISOString(),targetCount:Number(row.target_count),jobCount:Number(row.job_count),failureCount:Number(row.failure_count),failures:row.failures as unknown[],sourceResults:row.source_results as unknown[]}:null;}
}
