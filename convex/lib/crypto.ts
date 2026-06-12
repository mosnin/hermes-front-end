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
