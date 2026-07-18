/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as a2a from "../a2a.js";
import type * as a2aExternal from "../a2aExternal.js";
import type * as a2aProtocol from "../a2aProtocol.js";
import type * as activity from "../activity.js";
import type * as admin from "../admin.js";
import type * as agents from "../agents.js";
import type * as alerts from "../alerts.js";
import type * as analytics from "../analytics.js";
import type * as apiKeys from "../apiKeys.js";
import type * as approvals from "../approvals.js";
import type * as artifacts from "../artifacts.js";
import type * as audit from "../audit.js";
import type * as billing from "../billing.js";
import type * as bridges from "../bridges.js";
import type * as campaigns from "../campaigns.js";
import type * as connector from "../connector.js";
import type * as costs from "../costs.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as embeddings from "../embeddings.js";
import type * as engine from "../engine.js";
import type * as evals from "../evals.js";
import type * as fleet from "../fleet.js";
import type * as fleetMetering from "../fleetMetering.js";
import type * as goals from "../goals.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as ledger from "../ledger.js";
import type * as lib_adminAuth from "../lib/adminAuth.js";
import type * as lib_auditChain from "../lib/auditChain.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_channels from "../lib/channels.js";
import type * as lib_cloudflare from "../lib/cloudflare.js";
import type * as lib_composio from "../lib/composio.js";
import type * as lib_counters from "../lib/counters.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_guards from "../lib/guards.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_metering from "../lib/metering.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as maintenance from "../maintenance.js";
import type * as mcp from "../mcp.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as metrics from "../metrics.js";
import type * as notifications from "../notifications.js";
import type * as observability from "../observability.js";
import type * as planner from "../planner.js";
import type * as publicApi from "../publicApi.js";
import type * as reliability from "../reliability.js";
import type * as reports from "../reports.js";
import type * as router from "../router.js";
import type * as search from "../search.js";
import type * as secrets from "../secrets.js";
import type * as skills from "../skills.js";
import type * as spaces from "../spaces.js";
import type * as squads from "../squads.js";
import type * as status from "../status.js";
import type * as streaming from "../streaming.js";
import type * as stripe from "../stripe.js";
import type * as tasks from "../tasks.js";
import type * as threads from "../threads.js";
import type * as triggers from "../triggers.js";
import type * as usage from "../usage.js";
import type * as workEvents from "../workEvents.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  a2a: typeof a2a;
  a2aExternal: typeof a2aExternal;
  a2aProtocol: typeof a2aProtocol;
  activity: typeof activity;
  admin: typeof admin;
  agents: typeof agents;
  alerts: typeof alerts;
  analytics: typeof analytics;
  apiKeys: typeof apiKeys;
  approvals: typeof approvals;
  artifacts: typeof artifacts;
  audit: typeof audit;
  billing: typeof billing;
  bridges: typeof bridges;
  campaigns: typeof campaigns;
  connector: typeof connector;
  costs: typeof costs;
  crons: typeof crons;
  demo: typeof demo;
  embeddings: typeof embeddings;
  engine: typeof engine;
  evals: typeof evals;
  fleet: typeof fleet;
  fleetMetering: typeof fleetMetering;
  goals: typeof goals;
  health: typeof health;
  http: typeof http;
  integrations: typeof integrations;
  ledger: typeof ledger;
  "lib/adminAuth": typeof lib_adminAuth;
  "lib/auditChain": typeof lib_auditChain;
  "lib/auth": typeof lib_auth;
  "lib/channels": typeof lib_channels;
  "lib/cloudflare": typeof lib_cloudflare;
  "lib/composio": typeof lib_composio;
  "lib/counters": typeof lib_counters;
  "lib/crypto": typeof lib_crypto;
  "lib/events": typeof lib_events;
  "lib/guards": typeof lib_guards;
  "lib/idempotency": typeof lib_idempotency;
  "lib/metering": typeof lib_metering;
  "lib/observability": typeof lib_observability;
  "lib/plans": typeof lib_plans;
  "lib/schedule": typeof lib_schedule;
  maintenance: typeof maintenance;
  mcp: typeof mcp;
  memories: typeof memories;
  messages: typeof messages;
  metrics: typeof metrics;
  notifications: typeof notifications;
  observability: typeof observability;
  planner: typeof planner;
  publicApi: typeof publicApi;
  reliability: typeof reliability;
  reports: typeof reports;
  router: typeof router;
  search: typeof search;
  secrets: typeof secrets;
  skills: typeof skills;
  spaces: typeof spaces;
  squads: typeof squads;
  status: typeof status;
  streaming: typeof streaming;
  stripe: typeof stripe;
  tasks: typeof tasks;
  threads: typeof threads;
  triggers: typeof triggers;
  usage: typeof usage;
  workEvents: typeof workEvents;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
