export type SourceKind = "CAREERS" | "EARLY_CAREERS" | "EVENTS";

export type TargetSource = {
  id: string;
  kind: SourceKind;
  url: string;
  enabled: boolean;
  scanCron: string;
};

export type TargetCompany = {
  id: string;
  name: string;
  domain: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  roleKeywords: string[];
  eventKeywords: string[];
  sources: TargetSource[];
  createdAt: string;
};

type DiscoveryEvidence = {
  sourceId: string;
  sourceUrl: string;
  canonicalUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  contentFingerprint: string;
  extractionConfidence: number;
};

export type JobPosting = DiscoveryEvidence & {
  kind: "JOB";
  id: string;
  companyId: string;
  title: string;
  description: string;
  locations: string[];
  employmentType: "INTERNSHIP" | "NEW_GRAD" | "EARLY_CAREER" | "OTHER";
  applicationUrl: string;
};

export type RecruitingEvent = DiscoveryEvidence & {
  kind: "EVENT";
  id: string;
  companyId: string;
  title: string;
  description: string;
  eventType:
    | "INFO_SESSION"
    | "CAMPUS_RECRUITING"
    | "OFFICE_HOURS"
    | "WORKSHOP"
    | "CONFERENCE"
    | "HACKATHON"
    | "NETWORKING"
    | "OTHER";
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  format: "VIRTUAL" | "IN_PERSON" | "HYBRID";
  location: string | null;
  registrationUrl: string;
  registrationDeadline: string | null;
  audience: string[];
  status: "ANNOUNCED" | "REGISTRATION_OPEN" | "FULL" | "CANCELLED" | "COMPLETED";
};

export type Opportunity = JobPosting | RecruitingEvent;

export interface DiscoveryStrategy {
  readonly name: string;
  supports(url: URL): Promise<boolean>;
  discover(source: TargetSource, signal?: AbortSignal): Promise<Opportunity[]>;
}
