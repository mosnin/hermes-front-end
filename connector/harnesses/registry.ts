/**
 * Harness manifest registry + loader — the fleet worker's single source of
 * truth for "which harness ids exist, which image boots them, what env they
 * need". See docs/HARNESS_SPEC.md for the narrative spec and schema.ts for
 * the manifest shape + validator.
 *
 * Manifests are checked in as static JSON (connector/harnesses/<id>/harness.json)
 * and imported directly here so the Cloudflare Worker bundler inlines them at
 * build time — no filesystem access at runtime (Workers have none).
 */

import { HarnessId, HarnessManifest, HARNESS_IDS, validateManifest } from "./schema";

import hermesManifest from "./hermes/harness.json";
import openclawManifest from "./openclaw/harness.json";
import gooseManifest from "./goose/harness.json";
import genericCliManifest from "./generic-cli/harness.json";

const RAW: Record<Exclude<HarnessId, "custom">, unknown> = {
  hermes: hermesManifest,
  openclaw: openclawManifest,
  goose: gooseManifest,
  "generic-cli": genericCliManifest,
};

function build(): Map<string, HarnessManifest> {
  const map = new Map<string, HarnessManifest>();
  for (const [id, raw] of Object.entries(RAW)) {
    validateManifest(raw, id);
    map.set(id, raw);
  }
  return map;
}

/** Validated at module load — a malformed harness.json fails the Worker's build/boot, not a request. */
const MANIFESTS: Map<string, HarnessManifest> = build();

export class UnknownHarnessError extends Error {
  constructor(id: string) {
    super(`unknown harness ${JSON.stringify(id)} — supported: ${[...MANIFESTS.keys()].join(", ")}, custom (BYO image)`);
    this.name = "UnknownHarnessError";
  }
}

/** Look up a built-in harness's manifest. Throws UnknownHarnessError for "custom" or an unrecognized id. */
export function loadManifest(id: string): HarnessManifest {
  const m = MANIFESTS.get(id);
  if (!m) throw new UnknownHarnessError(id);
  return m;
}

export function listManifests(): HarnessManifest[] {
  return [...MANIFESTS.values()];
}

/** True for any id `loadManifest` can resolve (excludes "custom", which has no fixed image). */
export function isKnownHarness(id: string): boolean {
  return MANIFESTS.has(id);
}

export { HARNESS_IDS };
export type { HarnessId, HarnessManifest };
