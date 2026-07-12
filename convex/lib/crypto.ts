// Small crypto helpers. These run inside Convex *actions* and *HTTP actions*,
// which expose the Web Crypto API (crypto.subtle / crypto.randomUUID).

/** Hex-encoded SHA-256 of a string. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A long, URL-safe random connector token (shown to the user once). */
export function generateToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

/** Hex-encoded HMAC-SHA256 of a message (webhook request signing). */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time hex comparison — a naive === leaks how many leading characters
 * matched through response timing, which lets an attacker forge signatures
 * byte by byte.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify a Slack Events API request signature (the real scheme: v0=HMAC-SHA256
 * over "v0:{timestamp}:{rawBody}" with the app's signing secret), rejecting
 * stale timestamps to block replay.
 */
export async function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false; // >5m = replay
  const expected =
    "v0=" + (await hmacSha256Hex(signingSecret, `v0:${timestamp}:${rawBody}`));
  return timingSafeEqualHex(expected, signature);
}
