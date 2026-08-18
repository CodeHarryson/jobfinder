import { NextResponse } from "next/server";
import { getRepository } from "@/storage/jobfinder-repository";

export const runtime = "nodejs";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return getRepository().markNotificationRead(id)
    ? NextResponse.json({ updated: true })
    : NextResponse.json({ error: "Notification not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return getRepository().deleteNotification(id)
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Notification not found." }, { status: 404 });
}
