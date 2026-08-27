import assert from "node:assert/strict";
import test from "node:test";
import { classifyApplicationEmail } from "./classify-application-email.ts";

test("detects an online assessment and its deadline", () => {
  const result = classifyApplicationEmail({ subject: "Your coding assessment", snippet: "", bodyText: "Please complete your online assessment by September 10, 2027 at 5:00 PM." }, new Date("2027-08-01T00:00:00Z"));
  assert.equal(result?.status, "ASSESSMENT_RECEIVED");
  assert.equal(result?.commitmentKind, "OA");
  assert.ok(result?.scheduledAt);
});

test("prioritizes rejection language over a generic status update", () => {
  const result = classifyApplicationEmail({ subject: "Application status", snippet: "", bodyText: "We decided to pursue other candidates." });
  assert.equal(result?.status, "REJECTED");
  assert.equal(result?.confidence, 0.97);
});

test("ignores unrelated mail", () => {
  assert.equal(classifyApplicationEmail({ subject: "Your receipt", snippet: "Thanks", bodyText: "Order shipped" }), null);
});

