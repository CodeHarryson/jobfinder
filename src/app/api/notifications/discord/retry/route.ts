import { NextResponse } from "next/server";
import { dispatchDiscordNotifications } from "@/notifications/discord";
import { getRepository } from "@/storage/get-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET is required in production." }, { status: 503 });
  return NextResponse.json(await dispatchDiscordNotifications(getRepository()));
}
