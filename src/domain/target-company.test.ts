import assert from "node:assert/strict";
import test from "node:test";
import { createTargetCompany, updateTargetCompany } from "./target-company.ts";

test("creates an ATS-agnostic target with career and event sources", () => {
  const result = createTargetCompany({
    name: " Acme ",
    domain: "https://acme.test/",
    careerUrl: "https://acme.test/careers",
    eventsUrl: "https://acme.test/students/events",
    roleKeywords: ["Intern", "intern", " New Grad "],
    eventKeywords: ["University", "Hackathon"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.domain, "acme.test");
  assert.deepEqual(result.value.roleKeywords, ["intern", "new grad"]);
  assert.deepEqual(result.value.sources.map(({ kind }) => kind), ["CAREERS", "EVENTS"]);
  assert.ok(result.value.sources.every(({ scanCron }) => scanCron === "* * * * *"));
});

test("rejects missing or unsupported source URLs", () => {
  const result = createTargetCompany({
    name: "Acme",
    domain: "acme.test",
    careerUrl: "file:///careers",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, ["Career URL must use http or https."]);
});

test("updates editable fields while preserving company identity", () => {
  const created = createTargetCompany({ name: "Acme", domain: "acme.test", careerUrl: "https://acme.test/jobs" });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const updated = updateTargetCompany(created.value, {
    name: "Acme Labs",
    domain: "acme.test",
    careerUrl: "https://acme.test/careers",
    eventsUrl: "https://acme.test/events",
    priority: "HIGH",
    roleKeywords: ["intern"],
  });

  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.value.id, created.value.id);
  assert.equal(updated.value.createdAt, created.value.createdAt);
  assert.equal(updated.value.name, "Acme Labs");
  assert.equal(updated.value.sources.length, 2);
  assert.equal(updated.value.sources[0].id, created.value.sources[0].id);
});
