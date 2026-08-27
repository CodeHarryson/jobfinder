export type ApplicationStatus =
  | "APPLIED"
  | "ASSESSMENT_RECEIVED"
  | "INTERVIEW_REQUESTED"
  | "INTERVIEW_SCHEDULED"
  | "REJECTED"
  | "OFFERED"
  | "STATUS_UPDATE";

export type EmailClassification = {
  status: ApplicationStatus;
  confidence: number;
  evidence: string[];
  commitmentKind: "OA" | "INTERVIEW" | null;
  scheduledAt: string | null;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  bodyText: string;
};

export type GoogleConnection = {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  scopes: string[];
  lastSyncedAt: string | null;
};

