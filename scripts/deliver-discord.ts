import { dispatchDiscordNotifications } from "../src/notifications/discord.ts";
import { PostgresRepository } from "../src/storage/postgres-repository.ts";

const databaseUrl = process.env.DATABASE_URL;
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!databaseUrl || !webhookUrl) {
  throw new Error("DATABASE_URL and DISCORD_WEBHOOK_URL are required for Discord delivery.");
}

const result = await dispatchDiscordNotifications(new PostgresRepository(databaseUrl));
console.log(JSON.stringify(result));
if (result.failed > 0) process.exitCode = 1;
