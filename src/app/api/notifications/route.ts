import { NextResponse } from "next/server";
import { getRepository } from "@/storage/get-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  return NextResponse.json({ notifications: await getRepository().listNotifications(unreadOnly) });
}

export async function PATCH() {
  const updated = await getRepository().markAllNotificationsRead();
  return NextResponse.json({ updated });
}
