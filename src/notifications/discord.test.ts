import assert from "node:assert/strict";
import test from "node:test";
import { discordPayload, dispatchDiscordEvent, dispatchDiscordNotifications } from "./discord.ts";
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
