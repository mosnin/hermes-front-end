import { sha256Hex } from "./crypto";

/**
 * Tamper-evident audit chains (WORM-style export).
 *
 * Each exported audit entry is hash-chained to its predecessor:
 *   h_i = SHA-256(h_{i-1} + "|" + canonical(entry_i)),  h_0 = SHA-256(genesis)
 * Editing, dropping, reordering, or inserting ANY entry changes every hash
 * after it, so an auditor who records only the chain head can later prove the
 * exported log wasn't rewritten. Verification is a pure function any customer
 * can run offline — no trust in us required.
 */

export type ChainedEntry<T> = { entry: T; hash: string };

/** Stable stringify: sorts object keys so hashing is order-independent. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

export async function buildChain<T>(
  entries: T[],
  genesis: string,
): Promise<{ chained: ChainedEntry<T>[]; head: string }> {
  let prev = await sha256Hex(genesis);
  const chained: ChainedEntry<T>[] = [];
  for (const entry of entries) {
    const hash = await sha256Hex(`${prev}|${canonical(entry)}`);
    chained.push({ entry, hash });
    prev = hash;
  }
  return { chained, head: prev };
}

/** Recompute the chain and compare — false on any tamper/reorder/removal. */
export async function verifyChain<T>(
  chained: ChainedEntry<T>[],
  genesis: string,
  expectedHead: string,
): Promise<boolean> {
  let prev = await sha256Hex(genesis);
  for (const { entry, hash } of chained) {
    const expected = await sha256Hex(`${prev}|${canonical(entry)}`);
    if (expected !== hash) return false;
    prev = hash;
  }
  return prev === expectedHead;
}
