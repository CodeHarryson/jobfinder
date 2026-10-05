import { inngest } from "./client.ts";
import { syncAllGmailConnections } from "../email/sync.ts";
import { getRepository } from "../storage/get-repository.ts";
import { runScheduledDiscovery } from "../discovery/run-scheduled-discovery.ts";
import { dispatchDiscordNotifications, dispatchSourceFailureAlerts } from "../notifications/discord.ts";

export const gmailSync = inngest.createFunction(
  { id: "gmail-application-status-sync", retries: 3, concurrency: { limit: 1 }, triggers: [{ event: "jobfinder/gmail.sync.requested" }, { cron: "*/5 * * * *" }] },
  async ({ step }) => step.run("sync-gmail", syncAllGmailConnections),
);

export const discoveryScan = inngest.createFunction(
  { id: "scheduled-job-discovery", retries: 2, concurrency: { limit: 1 }, triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => step.run("scan-and-deliver", async () => {
    const repository = getRepository();
    const scan = await runScheduledDiscovery(repository);
    const delivery = await dispatchDiscordNotifications(repository);
    const healthAlerts = await dispatchSourceFailureAlerts(repository);
    return { scan, delivery, healthAlerts };
  }),
);

export const inngestFunctions = [gmailSync, discoveryScan];
