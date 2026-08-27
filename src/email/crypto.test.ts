import assert from "node:assert/strict";
import test from "node:test";
import { createOAuthState, decryptSecret, encryptSecret, verifyOAuthState } from "./crypto.ts";

test("encrypts tokens with authenticated encryption", () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test-only-secret";
  const encrypted = encryptSecret("refresh-token");
  assert.notEqual(encrypted, "refresh-token");
  assert.equal(decryptSecret(encrypted), "refresh-token");
});

test("signs OAuth state and rejects tampering", () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test-only-secret";
  const state = createOAuthState();
  assert.equal(verifyOAuthState(state), true);
  assert.equal(verifyOAuthState(`${state}x`), false);
});

