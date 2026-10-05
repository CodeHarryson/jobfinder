import assert from "node:assert/strict";
import test from "node:test";
import { discordPayload, dispatchDiscordEvent, dispatchDiscordNotifications, dispatchSourceFailureAlerts } from "./discord.ts";
import type { Repository } from "../storage/repository.ts";
import type { NotificationDelivery } from "../storage/jobfinder-repository.ts";

test("builds a safe rich Discord opportunity alert", () => {
  const payload = discordPayload({ id: "n1", jobId: "j1", companyId: "c1", kind: "NEW", createdAt: "2026-08-18T00:00:00.000Z",
    readAt: null, companyName: "Notion", jobTitle: "Software Engineering Intern", applicationUrl: "https://example.com/jobs/1" });
  assert.match(payload.content, /New opportunity/);
  assert.equal(payload.embeds[0].url, "https://example.com/jobs/1");
  assert.deepEqual(payload.allowed_mentions.parse, []);
});

test("sends an event-specific Discord alert", async () => {
  const original=process.env.DISCORD_WEBHOOK_URL;process.env.DISCORD_WEBHOOK_URL="https://discord.example/webhook";
  let body="";
  try {
    const result=await dispatchDiscordEvent({kind:"EVENT",id:"e1",companyId:"c1",sourceId:"s1",sourceUrl:"https://example.com",canonicalUrl:"https://example.com/e",registrationUrl:"https://example.com/e",title:"Resume Workshop",description:"For interns",eventType:"WORKSHOP",startsAt:null,endsAt:null,timezone:"America/Chicago",format:"VIRTUAL",location:null,registrationDeadline:null,audience:["Internship candidates"],status:"REGISTRATION_OPEN",firstSeenAt:"2026-08-20T00:00:00.000Z",lastSeenAt:"2026-08-20T00:00:00.000Z",contentFingerprint:"x",extractionConfidence:0.8},{id:"c1",name:"Google",domain:"google.com",priority:"HIGH",roleKeywords:[],eventKeywords:[],sources:[],createdAt:"2026-08-20T00:00:00.000Z"},"NEW",async (_url,init)=>{body=String(init?.body);return new Response('{"id":"1"}',{status:200,headers:{"content-type":"application/json"}});});
    assert.equal(result.sent,true);assert.match(body,/New early-career event/);assert.match(body,/Resume Workshop/);
  } finally { if(original===undefined) delete process.env.DISCORD_WEBHOOK_URL; else process.env.DISCORD_WEBHOOK_URL=original; }
});

test("stops claiming deliveries after Discord rate limits a webhook", async () => {
  const original = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
  const delivery: NotificationDelivery = { id: "d1", attempts: 1, notification: {
    id: "n1", jobId: "j1", companyId: "c1", kind: "NEW", createdAt: "2026-09-18T00:00:00.000Z",
    readAt: null, companyName: "Notion", jobTitle: "Intern", applicationUrl: "https://example.com/jobs/1",
  } };
  let claims = 0;
  let failed: unknown[] = [];
  const repository = {
    enqueueDiscordDeliveries: async () => 0,
    claimDiscordDeliveries: async () => { claims += 1; return [delivery]; },
    failDiscordDelivery: async (...args: unknown[]) => { failed = args; },
  } as unknown as Repository;
  try {
    const result = await dispatchDiscordNotifications(repository, [], async () =>
      new Response("", { status: 429, headers: { "Retry-After": "3" } }));
    assert.deepEqual(result, { enabled: true, queued: 0, sent: 0, failed: 1 });
    assert.equal(claims, 1);
    assert.deepEqual(failed, ["d1", 1, "Discord returned 429.", 3000]);
  } finally {
    if (original === undefined) delete process.env.DISCORD_WEBHOOK_URL;
    else process.env.DISCORD_WEBHOOK_URL = original;
  }
});

function alertRepository(overrides: Partial<Repository> = {}) {
  const cooldowns = new Map<string, number>();
  const base = {
    listScanHistory: async () => [
      { startedAt: "2026-09-30T02:00:00.000Z", failures: [{ companyId: "meta", sourceId: "s1", sourceUrl: "https://www.metacareers.com/jobs/", provider: "META_CAREERS", message: "Source returned HTTP 502." }], sourceResults: [] },
      { startedAt: "2026-09-30T01:00:00.000Z", failures: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", message: "Source returned HTTP 502." }], sourceResults: [] },
      { startedAt: "2026-09-30T00:00:00.000Z", failures: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", message: "Source returned HTTP 502." }], sourceResults: [] },
    ],
    listTargets: async () => [{ id: "meta", name: "Meta", domain: "metacareers.com", priority: "HIGH", roleKeywords: [], eventKeywords: [],
      createdAt: "2026-08-20T00:00:00.000Z", sources: [{ id: "s1", kind: "CAREERS", url: "https://www.metacareers.com/jobs/", enabled: true, scanCron: "* * * * *" }] }],
    claimSourceAlert: async (sourceId: string, cooldownMs: number, now = new Date()) => {
      const previous = cooldowns.get(sourceId);
      if (previous !== undefined && previous > now.getTime() - cooldownMs) return false;
      cooldowns.set(sourceId, now.getTime());
      return true;
    },
    clearSourceAlert: async (sourceId: string) => { cooldowns.delete(sourceId); },
  };
  return { repository: { ...base, ...overrides } as unknown as Repository, cooldowns };
}

async function withWebhook<T>(run: () => Promise<T>): Promise<T> {
  const original = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
  try { return await run(); } finally {
    if (original === undefined) delete process.env.DISCORD_WEBHOOK_URL;
    else process.env.DISCORD_WEBHOOK_URL = original;
  }
}

test("alerts on a source that has failed three scans in a row", async () => {
  await withWebhook(async () => {
    const { repository } = alertRepository();
    let body = "";
    const result = await dispatchSourceFailureAlerts(repository, new Date("2026-09-30T02:05:00.000Z"), async (_url, init) => {
      body = String(init?.body);
      return new Response('{"id":"1"}', { status: 200, headers: { "content-type": "application/json" } });
    });
    assert.deepEqual(result, { enabled: true, alerted: 1, suppressed: 0, failed: 0 });
    assert.match(body, /Discovery is failing for \*\*Meta\*\*/);
    assert.match(body, /META_CAREERS/);
    assert.match(body, /HTTP 502/);
    assert.match(body, /"name":"Consecutive failures","value":"3"/);
  });
});

test("stays quiet below the failure threshold", async () => {
  await withWebhook(async () => {
    const { repository } = alertRepository({
      listScanHistory: async () => [
        { startedAt: "2026-09-30T02:00:00.000Z", failures: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", message: "timeout" }], sourceResults: [] },
        { startedAt: "2026-09-30T01:00:00.000Z", failures: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", message: "timeout" }], sourceResults: [] },
      ],
    });
    let calls = 0;
    const result = await dispatchSourceFailureAlerts(repository, new Date(), async () => { calls += 1; return new Response("{}", { status: 200 }); });
    assert.deepEqual(result, { enabled: true, alerted: 0, suppressed: 0, failed: 0 });
    assert.equal(calls, 0);
  });
});

test("sends one alert per cooldown window, then alerts again after it lapses", async () => {
  await withWebhook(async () => {
    const { repository } = alertRepository();
    let calls = 0;
    const send = async () => { calls += 1; return new Response("{}", { status: 200 }); };
    const first = await dispatchSourceFailureAlerts(repository, new Date("2026-09-30T02:05:00.000Z"), send);
    const second = await dispatchSourceFailureAlerts(repository, new Date("2026-09-30T06:05:00.000Z"), send);
    const third = await dispatchSourceFailureAlerts(repository, new Date("2026-10-01T02:05:00.000Z"), send);
    assert.equal(first.alerted, 1);
    assert.deepEqual([second.alerted, second.suppressed], [0, 1]);
    assert.equal(third.alerted, 1);
    assert.equal(calls, 2);
  });
});

test("releases the cooldown claim when Discord rejects the alert", async () => {
  await withWebhook(async () => {
    const { repository, cooldowns } = alertRepository();
    const result = await dispatchSourceFailureAlerts(repository, new Date("2026-09-30T02:05:00.000Z"),
      async () => new Response("", { status: 500 }));
    assert.deepEqual(result, { enabled: true, alerted: 0, suppressed: 0, failed: 1 });
    assert.equal(cooldowns.has("s1"), false);
  });
});

test("clears the cooldown for a source that is scanning cleanly again", async () => {
  await withWebhook(async () => {
    const { repository, cooldowns } = alertRepository({
      listScanHistory: async () => [{ startedAt: "2026-09-30T02:00:00.000Z", failures: [],
        sourceResults: [{ companyId: "meta", sourceId: "s1", provider: "META_CAREERS", discoveredCount: 6 }] }],
    });
    cooldowns.set("s1", Date.parse("2026-09-30T00:00:00.000Z"));
    const result = await dispatchSourceFailureAlerts(repository, new Date("2026-09-30T02:05:00.000Z"),
      async () => new Response("{}", { status: 200 }));
    assert.deepEqual(result, { enabled: true, alerted: 0, suppressed: 0, failed: 0 });
    assert.equal(cooldowns.has("s1"), false);
  });
});

test("does nothing when no Discord webhook is configured", async () => {
  const original = process.env.DISCORD_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK_URL;
  try {
    const { repository } = alertRepository();
    assert.deepEqual(await dispatchSourceFailureAlerts(repository, new Date(), async () => { throw new Error("must not send"); }),
      { enabled: false, alerted: 0, suppressed: 0, failed: 0 });
  } finally { if (original !== undefined) process.env.DISCORD_WEBHOOK_URL = original; }
});
