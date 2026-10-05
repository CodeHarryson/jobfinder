import type { DiscoveryChange, NotificationItem } from "../storage/jobfinder-repository.ts";
import type { Repository } from "../storage/repository.ts";
import type { RecruitingEvent, TargetCompany } from "../domain/opportunity.ts";
import { sourceFailureStreaks, type SourceFailureStreak } from "../discovery/source-health.ts";

export const MAX_DELIVERIES_PER_RUN = 120;

export function discordPayload(item: NotificationItem) {
  const isNew = item.kind === "NEW";
  return {
    username: "JobFinder",
    content: isNew ? `🚨 New opportunity at **${item.companyName}**` : `📝 Opportunity updated at **${item.companyName}**`,
    embeds: [{
      title: item.jobTitle,
      url: item.applicationUrl,
      color: isNew ? 0x1f6848 : 0xf4a261,
      fields: [
        { name: "Company", value: item.companyName, inline: true },
        { name: "Change", value: isNew ? "New role" : "Posting updated", inline: true },
      ],
      timestamp: item.createdAt,
      footer: { text: "JobFinder discovery alert" },
    }],
    allowed_mentions: { parse: [] },
  };
}

export async function dispatchDiscordNotifications(repository: Repository, changes: DiscoveryChange[] = [], fetcher: typeof fetch = fetch) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { enabled: false, queued: 0, sent: 0, failed: 0 };
  const queued = await repository.enqueueDiscordDeliveries(changes);
  let sent = 0;
  let failed = 0;
  // A single company internship drop can be dozens of postings at once. At 750ms
  // per send this budget stays inside the discovery execution window while
  // clearing a large batch in one run instead of trickling it out over hours.
  for (let index = 0; index < MAX_DELIVERIES_PER_RUN; index += 1) {
    // Claim one at a time so a rate limit does not strand a claimed batch in SENDING.
    const [delivery] = await repository.claimDiscordDeliveries(1);
    if (!delivery) break;
    try {
      const separator = webhookUrl.includes("?") ? "&" : "?";
      const response = await fetcher(`${webhookUrl}${separator}wait=true`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(discordPayload(delivery.notification)),
      });
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterBody = retryAfterHeader ? null : await response.json().catch(() => null) as { retry_after?: number } | null;
        const retryAfter = Number(retryAfterHeader ?? retryAfterBody?.retry_after);
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter * 1000) : 60_000;
        await repository.failDiscordDelivery(delivery.id, delivery.attempts, "Discord returned 429.", delay);
        failed += 1;
        break;
      }
      if (!response.ok) throw new Error(`Discord returned ${response.status}.`);
      const result = await response.json() as { id?: string };
      await repository.completeDiscordDelivery(delivery.id, result.id ?? "accepted");
      sent += 1;
      // Discord's per-webhook limit is shared with other senders to this channel.
      await new Promise((resolve) => setTimeout(resolve, 750));
    } catch (error) {
      await repository.failDiscordDelivery(delivery.id, delivery.attempts, error instanceof Error ? error.message : "Discord delivery failed.");
      failed += 1;
    }
  }
  return { enabled: true, queued, sent, failed };
}

// A source is only worth alerting on once it has failed several scans in a row:
// a single failure is usually a timeout or a transient 5xx that self-heals.
export const SOURCE_FAILURE_THRESHOLD = 3;
export const SOURCE_ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export function sourceFailurePayload(streak: SourceFailureStreak, companyName: string) {
  return {
    username: "JobFinder",
    content: `⚠️ Discovery is failing for **${companyName}** — no new postings are being found.`,
    embeds: [{
      title: `${streak.provider} scan failing`,
      url: streak.sourceUrl,
      color: 0xc0392b,
      description: streak.message.slice(0, 1000),
      fields: [
        { name: "Company", value: companyName, inline: true },
        { name: "Provider", value: streak.provider, inline: true },
        { name: "Consecutive failures", value: String(streak.consecutiveFailures), inline: true },
        { name: "Failing since", value: streak.firstFailedAt, inline: false },
      ],
      timestamp: streak.lastFailedAt,
      footer: { text: "JobFinder discovery health alert" },
    }],
    allowed_mentions: { parse: [] },
  };
}

/**
 * Alerts on sources that have failed `SOURCE_FAILURE_THRESHOLD` scans in a row,
 * so a broken adapter surfaces instead of looking like a quiet hiring market.
 * Each source alerts at most once per cooldown window, and a source that starts
 * succeeding again has its cooldown cleared so a future break alerts promptly.
 */
export async function dispatchSourceFailureAlerts(repository: Repository, now = new Date(), fetcher: typeof fetch = fetch) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { enabled: false, alerted: 0, suppressed: 0, failed: 0 };
  const [history, targets] = await Promise.all([repository.listScanHistory(100), repository.listTargets()]);
  const streaks = sourceFailureStreaks(history);
  const names = new Map(targets.map((target) => [target.id, target.name]));
  const failing = new Set(streaks.map((streak) => streak.sourceId));

  // Clearing a cooldown is best effort: a failure here must not stop the alert below.
  const clearAlert = async (sourceId: string) => {
    try { await repository.clearSourceAlert(sourceId); } catch { /* retried next scan */ }
  };

  // Any source that is not currently in a failure streak is healthy, so drop its
  // cooldown marker rather than letting a stale one mute the next real outage.
  await Promise.all(targets.flatMap((target) => target.sources
    .filter((source) => !failing.has(source.id))
    .map((source) => clearAlert(source.id))));

  let alerted = 0;
  let suppressed = 0;
  let failed = 0;
  for (const streak of streaks) {
    if (streak.consecutiveFailures < SOURCE_FAILURE_THRESHOLD) continue;
    if (!await repository.claimSourceAlert(streak.sourceId, SOURCE_ALERT_COOLDOWN_MS, now)) {
      suppressed += 1;
      continue;
    }
    const separator = webhookUrl.includes("?") ? "&" : "?";
    try {
      const response = await fetcher(`${webhookUrl}${separator}wait=true`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceFailurePayload(streak, names.get(streak.companyId) ?? "Unknown company")),
      });
      if (!response.ok) throw new Error(`Discord returned ${response.status}.`);
      alerted += 1;
      await new Promise((resolve) => setTimeout(resolve, 750));
    } catch {
      // Release the claim so the next scan retries rather than waiting out the cooldown.
      await clearAlert(streak.sourceId);
      failed += 1;
    }
  }
  return { enabled: true, alerted, suppressed, failed };
}

export async function dispatchDiscordEvent(event: RecruitingEvent, company: TargetCompany, change: "NEW" | "UPDATED", fetcher: typeof fetch = fetch) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { enabled: false, sent: false };
  const separator = webhookUrl.includes("?") ? "&" : "?";
  const response = await fetcher(`${webhookUrl}${separator}wait=true`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "JobFinder",
      content: `🎓 ${change === "NEW" ? "New" : "Updated"} early-career event at **${company.name}**`,
      embeds: [{ title: event.title, url: event.registrationUrl, color: 0x4285f4,
        description: event.description.slice(0, 3000),
        fields: [
          { name: "Location", value: event.location ?? "Not announced", inline: true },
          { name: "Starts", value: event.startsAt ? new Date(event.startsAt).toLocaleString("en-US", { timeZone: event.timezone }) : "Not announced", inline: true },
          { name: "Status", value: event.status.replaceAll("_", " ").toLowerCase(), inline: true },
        ], timestamp: event.lastSeenAt, footer: { text: "JobFinder event alert" } }],
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) throw new Error(`Discord returned ${response.status}.`);
  return { enabled: true, sent: true };
}
