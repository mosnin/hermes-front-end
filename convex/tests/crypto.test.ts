import { describe, expect, test } from "vitest";
import {
  hmacSha256Hex,
  timingSafeEqualHex,
  verifySlackSignature,
} from "../lib/crypto";

describe("request signing", () => {
  test("hmacSha256Hex matches a known RFC 4231-style vector", async () => {
    // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
    expect(
      await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"),
    ).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });

  test("timingSafeEqualHex", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abc")).toBe(false);
  });

  test("verifySlackSignature accepts a correctly signed request", async () => {
    const secret = "8f742231b10e8888abcd99yyyzzz85a5";
    const now = 1_700_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"event_callback","event":{"type":"message"}}';
    const sig = "v0=" + (await hmacSha256Hex(secret, `v0:${ts}:${body}`));
    expect(await verifySlackSignature(secret, ts, sig, body, now)).toBe(true);
  });

  test("verifySlackSignature rejects tampering, wrong secret, and replay", async () => {
    const secret = "topsecret";
    const now = 1_700_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const body = '{"a":1}';
    const sig = "v0=" + (await hmacSha256Hex(secret, `v0:${ts}:${body}`));

    // Tampered body
    expect(await verifySlackSignature(secret, ts, sig, '{"a":2}', now)).toBe(false);
    // Wrong secret
    expect(await verifySlackSignature("other", ts, sig, body, now)).toBe(false);
    // Replay: same signature presented 10 minutes later
    expect(
      await verifySlackSignature(secret, ts, sig, body, now + 10 * 60 * 1000),
    ).toBe(false);
    // Missing headers
    expect(await verifySlackSignature(secret, null, sig, body, now)).toBe(false);
    expect(await verifySlackSignature(secret, ts, null, body, now)).toBe(false);
  });
});
