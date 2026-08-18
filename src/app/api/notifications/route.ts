import { NextResponse } from "next/server";
import { getRepository } from "@/storage/jobfinder-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  return NextResponse.json({ notifications: getRepository().listNotifications(unreadOnly) });
}

export async function PATCH() {
  const updated = getRepository().markAllNotificationsRead();
  return NextResponse.json({ updated });
}
