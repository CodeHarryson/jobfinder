import { NextResponse } from "next/server";
import { extractEventPage } from "@/discovery/extract-event";
import { fetchCareerPage } from "@/discovery/scan-targets";
import { dispatchDiscordEvent } from "@/notifications/discord";
import { getRepository } from "@/storage/get-repository";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ events: await getRepository().listEvents() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown; companyId?: unknown };
    if (typeof body.url !== "string" || typeof body.companyId !== "string") {
      return NextResponse.json({ error: "Event URL and company are required." }, { status: 400 });
    }
    const url = new URL(body.url);
    if (url.protocol !== "https:" || url.hostname !== "rsvp.withgoogle.com" || !url.pathname.startsWith("/events/")) {
      return NextResponse.json({ error: "The first release supports direct WithGoogle RSVP event URLs." }, { status: 400 });
    }
    const repository = getRepository();
    const company = (await repository.listTargets()).find(({ id }) => id === body.companyId);
    if (!company) return NextResponse.json({ error: "The selected company is not in the watchlist." }, { status: 404 });
    const event = extractEventPage(await fetchCareerPage(url.toString()), url.toString(), company);
    const change = await repository.saveEvent(event);
    const delivery = change ? await dispatchDiscordEvent(event, company, change).catch((error) => ({ enabled: true, sent: false, error: error instanceof Error ? error.message : "Discord delivery failed." })) : null;
    return NextResponse.json({ event, change, delivery }, { status: change === "NEW" ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import event." }, { status: 400 });
  }
}
