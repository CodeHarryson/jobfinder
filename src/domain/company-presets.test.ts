import assert from "node:assert/strict";
import test from "node:test";
import { MAANGO_PRESET, STARTER_PRESETS, TOP_TECH_PRESET, UNICORN_SCALEUPS_PRESET } from "./company-presets.ts";
import { createTargetCompany } from "./target-company.ts";

test("MAANGO preset contains six valid, editable target-company inputs", () => {
  assert.deepEqual(MAANGO_PRESET.companies.map(({ name }) => name), ["Meta", "Apple", "Amazon", "Netflix", "Google", "Oracle"]);
  const created = MAANGO_PRESET.companies.map(createTargetCompany);
  assert.equal(created.every(({ ok }) => ok), true);
  assert.equal(new Set(MAANGO_PRESET.companies.map(({ domain }) => domain)).size, 6);
});

test("startup preset contains valid, unique and editable company inputs", () => {
  assert.equal(UNICORN_SCALEUPS_PRESET.companies.length, 10);
  assert.equal(UNICORN_SCALEUPS_PRESET.companies.some(({ name }) => name === "Together AI"), true);
  assert.equal(UNICORN_SCALEUPS_PRESET.companies.some(({ name }) => name === "Stripe"), true);
  assert.equal(UNICORN_SCALEUPS_PRESET.companies.some(({ name }) => name === "Notion"), true);
  assert.equal(new Set(UNICORN_SCALEUPS_PRESET.companies.map(({ domain }) => domain)).size, 10);
  assert.equal(UNICORN_SCALEUPS_PRESET.companies.map(createTargetCompany).every(({ ok }) => ok), true);
});

test("top-tech preset contains 15 valid companies with no duplicate domains", () => {
  assert.equal(TOP_TECH_PRESET.companies.length, 15);
  assert.equal(TOP_TECH_PRESET.companies[0].name, "NVIDIA");
  assert.equal(TOP_TECH_PRESET.companies.some(({ name }) => name === "OpenAI"), true);
  assert.equal(TOP_TECH_PRESET.companies.some(({ name }) => name === "Anthropic"), true);
  assert.equal(new Set(TOP_TECH_PRESET.companies.map(({ domain }) => domain)).size, 15);
  assert.equal(TOP_TECH_PRESET.companies.map(createTargetCompany).every(({ ok }) => ok), true);
  assert.equal(STARTER_PRESETS.length, 3);
});
