import type { DiscoveryChange, JobFinderRepository, NotificationItem } from "../storage/jobfinder-repository.ts";

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

export async function dispatchDiscordNotifications(repository: JobFinderRepository, changes: DiscoveryChange[] = [], fetcher: typeof fetch = fetch) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { enabled: false, queued: 0, sent: 0, failed: 0 };
  const queued = repository.enqueueDiscordDeliveries(changes);
  const deliveries = repository.claimDiscordDeliveries();
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    try {
      const separator = webhookUrl.includes("?") ? "&" : "?";
      const response = await fetcher(`${webhookUrl}${separator}wait=true`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(discordPayload(delivery.notification)),
      });
      if (!response.ok) throw new Error(`Discord returned ${response.status}.`);
      const result = await response.json() as { id?: string };
      repository.completeDiscordDelivery(delivery.id, result.id ?? "accepted");
      sent += 1;
    } catch (error) {
      repository.failDiscordDelivery(delivery.id, delivery.attempts, error instanceof Error ? error.message : "Discord delivery failed.");
      failed += 1;
    }
  }
  return { enabled: true, queued, sent, failed };
}
