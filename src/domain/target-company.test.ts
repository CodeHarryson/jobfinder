import assert from "node:assert/strict";
import test from "node:test";
import { createTargetCompany } from "./target-company.ts";

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
