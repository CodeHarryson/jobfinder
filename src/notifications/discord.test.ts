import assert from "node:assert/strict";
import test from "node:test";
import { discordPayload } from "./discord.ts";

test("builds a safe rich Discord opportunity alert", () => {
  const payload = discordPayload({ id: "n1", jobId: "j1", companyId: "c1", kind: "NEW", createdAt: "2026-08-18T00:00:00.000Z",
    readAt: null, companyName: "Notion", jobTitle: "Software Engineering Intern", applicationUrl: "https://example.com/jobs/1" });
  assert.match(payload.content, /New opportunity/);
  assert.equal(payload.embeds[0].url, "https://example.com/jobs/1");
  assert.deepEqual(payload.allowed_mentions.parse, []);
});
