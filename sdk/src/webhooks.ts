// Verification helper for Cadre's approval webhook pushes
// (convex/notifications.ts's `deliverApproval`/`testDeliver`). Zero-dep — uses
// Web Crypto (`crypto.subtle`), available in every modern JS runtime this SDK
// targets (browsers, Node 18+, Deno, Cloudflare Workers, Vercel Edge).
//
// Cadre signs each webhook body as:
//   X-Cadre-Signature: sha256=<hex HMAC-SHA256 of the raw JSON body, keyed by
//                              the signing secret you set in Dashboard →
//                              Approvals → Notifications>
//
// Verify it against the *raw* request body (before any JSON.parse) — most
// frameworks buffer this for you (e.g. Next.js Route Handlers via
// `await req.text()`).

/** Hex-encode a byte buffer. */
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time comparison of two equal-length hex strings — a naive `===`
 * leaks how many leading characters matched through response timing, which
 * lets an attacker forge a signature byte by byte.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

/**
 * Verify an inbound Cadre approval webhook.
 *
 * ```ts
 * import { verifyCadreWebhookSignature } from "@/sdk/src";
 *
 * export async function POST(req: Request) {
 *   const rawBody = await req.text(); // must be the raw, unparsed body
 *   const signature = req.headers.get("x-cadre-signature");
 *   const ok = await verifyCadreWebhookSignature(rawBody, signature, process.env.CADRE_WEBHOOK_SECRET!);
 *   if (!ok) return new Response("invalid signature", { status: 401 });
 *   const payload = JSON.parse(rawBody);
 *   // ...
 * }
 * ```
 *
 * @param rawBody   The exact, unparsed request body Cadre sent (do not
 *                  re-serialize a parsed object — whitespace/key-order
 *                  differences will make the signature fail to verify even
 *                  for a genuine request).
 * @param signatureHeader The raw `X-Cadre-Signature` header value, e.g.
 *                  `"sha256=abcd1234..."`. Pass `null`/`undefined` safely —
 *                  returns `false`.
 * @param secret    The signing secret you configured for this channel
 *                  (Dashboard → Approvals → Notifications → Webhook).
 */
export async function verifyCadreWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  if (!provided) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqualHex(expected, provided);
}
