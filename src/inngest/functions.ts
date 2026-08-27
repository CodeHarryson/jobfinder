import { inngest } from "./client.ts";
import { syncAllGmailConnections } from "../email/sync.ts";

export const gmailSync = inngest.createFunction(
  { id: "gmail-application-status-sync", retries: 3, concurrency: { limit: 1 }, triggers: [{ event: "jobfinder/gmail.sync.requested" }, { cron: "*/5 * * * *" }] },
  async ({ step }) => step.run("sync-gmail", syncAllGmailConnections),
);

export const inngestFunctions = [gmailSync];
