/**
 * HarnessManifest — the contract every agent-runtime "harness" (Hermes's own
 * LLM loop, OpenClaw, Goose, an arbitrary CLI agent, ...) must satisfy to be
 * bootable by the fleet worker. See docs/HARNESS_SPEC.md for the narrative
 * spec; this file is the source of truth for the TS shape + a light runtime
 * validator (deliberately dependency-free — no ajv — since this ships inside
 * a Cloudflare Worker bundle where every KB of cold-start matters).
 *
 * New harnesses onboard by adding `connector/harnesses/<id>/harness.json`
 * (validated against this shape) + `connector/harnesses/<id>/Dockerfile`,
 * then registering the id in `registry.ts` and in wrangler.jsonc's
 * `containers` block (Cloudflare binds one container image per Durable
 * Object class at deploy time — see registry.ts for why each harness needs
 * its own DO class/binding).
 */

/** Known built-in harness ids. Custom/BYO-image agents use `"custom"`. */
export type HarnessId = "hermes" | "openclaw" | "goose" | "generic-cli" | "custom";

export interface HarnessEnvContract {
  /** Env vars the container REQUIRES to boot (fleet worker always sets these). */
  required: string[];
  /** Env vars the container reads if present but can run without. */
  optional?: string[];
  /**
   * Extra fixed env vars this harness's adapter needs beyond the standard
   * connector env (see connector/control_plane/frameworks.py) — e.g.
   * `HERMES_AGENT_FRAMEWORK=goose` so agent_runtime.py shells out to Goose
   * instead of running the built-in LLM loop.
   */
  fixed?: Record<string, string>;
}

export interface HarnessHealthProbe {
  /** TCP port the container exposes for liveness (matches Container.defaultPort). */
  port: number;
  /** HTTP path polled for readiness, if the harness serves one (else TCP-only). */
  path?: string;
  intervalSeconds?: number;
  timeoutSeconds?: number;
}

export interface HarnessInstall {
  /** Path to the Dockerfile, relative to the repo root. */
  dockerfile: string;
  /** Base image, for docs/traceability (informational — Dockerfile is authoritative). */
  baseImage: string;
}

export interface HarnessStart {
  /** argv the image's CMD/entrypoint runs (informational — mirrors the Dockerfile CMD). */
  command: string[];
}

export interface HarnessManifest {
  /** Stable id — must match the directory name under connector/harnesses/. */
  id: HarnessId;
  displayName: string;
  description?: string;
  /**
   * Harness framework version this manifest/image pins (NOT the connector
   * version). Flows into agents.harnessVersion on spawn (feature 5).
   */
  version: string;
  install: HarnessInstall;
  start: HarnessStart;
  env: HarnessEnvContract;
  health: HarnessHealthProbe;
  /** Capability tags this harness advertises (chat/workflow/rag/mcp/framework:<id>/...). */
  capabilities: string[];
  /**
   * Durable Object binding name in connector/fleet-worker/wrangler.jsonc that
   * boots THIS harness's image. Cloudflare Containers bind exactly one image
   * per DO class at deploy time, so each harness gets its own binding.
   */
  containerBinding: string;
  /** True for the reserved BYO-image slot — /spawn routes here when `imageRef` is set. */
  byoImage?: boolean;
}

export const HARNESS_IDS: HarnessId[] = ["hermes", "openclaw", "goose", "generic-cli", "custom"];

/** Lightweight structural validation — no external deps. Throws with a precise message. */
export function validateManifest(m: unknown, expectedId?: string): asserts m is HarnessManifest {
  if (!m || typeof m !== "object") throw new Error("harness manifest: not an object");
  const o = m as Record<string, unknown>;
  const need = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`harness manifest${expectedId ? ` (${expectedId})` : ""}: ${msg}`);
  };
  need(typeof o.id === "string" && HARNESS_IDS.includes(o.id as HarnessId), "id must be one of " + HARNESS_IDS.join("|"));
  if (expectedId) need(o.id === expectedId, `id ${JSON.stringify(o.id)} does not match directory ${JSON.stringify(expectedId)}`);
  need(typeof o.displayName === "string" && o.displayName.length > 0, "displayName must be a non-empty string");
  need(typeof o.version === "string" && o.version.length > 0, "version must be a non-empty string");
  need(typeof o.install === "object" && o.install !== null, "install must be an object");
  const install = o.install as Record<string, unknown>;
  need(typeof install.dockerfile === "string" && install.dockerfile.length > 0, "install.dockerfile must be a non-empty string");
  need(typeof install.baseImage === "string" && install.baseImage.length > 0, "install.baseImage must be a non-empty string");
  need(typeof o.start === "object" && o.start !== null, "start must be an object");
  const start = o.start as Record<string, unknown>;
  need(Array.isArray(start.command) && start.command.length > 0 && start.command.every((c) => typeof c === "string"), "start.command must be a non-empty string[]");
  need(typeof o.env === "object" && o.env !== null, "env must be an object");
  const env = o.env as Record<string, unknown>;
  need(Array.isArray(env.required) && env.required.every((e) => typeof e === "string"), "env.required must be a string[]");
  if (env.optional !== undefined) need(Array.isArray(env.optional), "env.optional must be a string[]");
  if (env.fixed !== undefined) need(typeof env.fixed === "object" && env.fixed !== null, "env.fixed must be a record<string,string>");
  need(typeof o.health === "object" && o.health !== null, "health must be an object");
  const health = o.health as Record<string, unknown>;
  need(typeof health.port === "number" && health.port > 0, "health.port must be a positive number");
  need(Array.isArray(o.capabilities) && o.capabilities.every((c) => typeof c === "string"), "capabilities must be a string[]");
  need(typeof o.containerBinding === "string" && o.containerBinding.length > 0, "containerBinding must be a non-empty string");
}
