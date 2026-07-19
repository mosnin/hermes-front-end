# Cadre Public API (v1)

REST surface for driving the Cadre control plane programmatically — agents,
fleet deploys, tasks, messages, workflows, and approvals. Routes are defined
in `convex/http.ts`; the internal query/mutation implementations live in
`convex/publicApi.ts` and `convex/approvals.ts`. A typed TypeScript client
ships in `sdk/` (`sdk/README.md`).

## Base URL

`https://<your-deployment>.convex.site` — your Convex deployment's HTTP
Actions URL (find it in the Convex dashboard, or `CONVEX_SITE_URL` in your
env). The hosted Cadre control plane is reachable at `https://api.cadre.to`.

## Authentication

Mint an API key from **Dashboard → Developer** (`convex/apiKeys.ts`, one key
per Space). Send it as a bearer token:

```
Authorization: Bearer hk_xxxxxxxxxxxxxxxxxxxxxxxx
```

Keys can optionally be scoped with `rateLimitPerMinute`, `expiresAt`, and
`scopes` at mint time (see **Scopes** below). A missing, malformed, revoked,
or expired key returns `401`.

> **Cross-team note:** `apiKeys.scopes`/`expiresAt`/`rateLimitPerMinute` are
> already enforced end-to-end by this API (`convex/http.ts`'s `gate()`), but
> `apiKeys.create` (owned by the platform/settings team, `convex/apiKeys.ts`)
> doesn't collect them from the mint UI yet — a key minted today is always
> unscoped (full access, default rate limit, no expiry). Extending the mint
> action/UI to accept `{ scopes?, rateLimitPerMinute?, expiresAt? }` is the
> only piece left to make scoped keys mintable end-to-end.

## Envelope

Every response is JSON with one of two shapes:

**Success**
```json
{ "data": { "...": "..." } }
```

**Failure**
```json
{ "error": { "code": "bad_request", "message": "title required" } }
```

Common error codes: `unauthorized` (401), `bad_request` (400), `not_found`
(404), `rate_limited` (429), `internal` (500).

## Rate limiting

Each key is limited to `rateLimitPerMinute` requests/minute (default **60**),
tracked in a fixed one-minute window per key. Exceeding it returns:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0

{ "error": { "code": "rate_limited", "message": "rate limit: 60/minute" } }
```

Every request (allowed or not) is also counted against a daily usage bucket
per key, queryable via `GET /api/v1/usage`.

Every **successful** `/api/v1/*` response also carries `X-RateLimit-Limit`
and `X-RateLimit-Remaining` (computed after that request was recorded), so
you can back off before you hit `429` instead of only finding out after:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
```

Usage counters (`apiUsage`) are retained for 1 day (minute buckets, used for
the live rate-limit window) and 90 days (daily buckets, used for `GET
/api/v1/usage` reporting), swept hourly.

## Scopes

Every route declares a required scope (e.g. `tasks:write`). A key minted
**without** an explicit `scopes` array is unrestricted — this keeps every key
minted before scoped keys existed working unchanged. A key minted **with**
`scopes` is strictly allow-listed: calling a route outside its scope list
returns `403 { error: { code: "forbidden", message: "this key is not scoped
for '<scope>'" } }` — checked before the rate limit is charged, so a rejected
call never eats into your quota.

| Scope | Routes |
| --- | --- |
| `agents:read` | `GET /api/v1/agents`, `GET /api/v1/agents/{id}` |
| `deploys:read` | `GET /api/v1/deploys` |
| `tasks:read` | `GET /api/v1/tasks` |
| `tasks:write` | `POST /api/v1/tasks`, `PATCH /api/v1/tasks/{id}` |
| `messages:write` | `POST /api/v1/messages` |
| `workflows:read` | `GET /api/v1/workflows`, `GET /api/v1/workflows/runs` |
| `workflows:write` | `POST /api/v1/workflows/run`, `POST /api/v1/workflows/{id}/toggle` |
| `approvals:read` | `GET /api/v1/approvals` |
| `approvals:write` | `POST /api/v1/approvals/{id}/decide`, `POST /api/v1/approvals/bulk-decide` |
| `usage:read` | `GET /api/v1/usage` |

## Pagination

Every `list*`-style `GET` route (`agents`, `deploys`, `tasks`, `workflows`,
`workflows/runs`, `approvals`) is cursor-paginated: it returns `cursor`
(a string, or `null` once exhausted) and `hasMore` alongside its data array.
Pass `?limit=N` (max/default `50`) and `?cursor=<opaque string>` (URL-encode
it) to page forward:

```json
{ "data": { "tasks": [ /* up to `limit` rows */ ], "cursor": "eyJ...", "hasMore": true } }
```

Fetch the next page with `?cursor=eyJ...`; stop once `hasMore` is `false`.
The SDK's list methods accept `{ cursor, limit }` and return the same shape —
see `sdk/README.md`.

---

## Endpoints

### `GET /api/v1/agents`
List agents in the key's Space. **Scope** `agents:read`. Paginated.

**Response** `data: { agents: Array<{ id, name, status, kind, framework?, capabilities, deploymentStatus? }>, cursor, hasMore }`

### `GET /api/v1/agents/{id}`
Single-agent detail — a superset of the list shape with a few extra fields
only worth paying for on a targeted fetch. **Scope** `agents:read`.

**Response** `data: { id, name, status, kind, framework?, harness?, capabilities, deploymentStatus?, vmProvider?, vmId?, region?, lastWorkAt?, idleState? }`,
or `404` if the id doesn't exist or isn't in this key's Space (never leaks
cross-tenant existence).

### `GET /api/v1/deploys`
List fleet agents provisioned onto a VM (a subset of `agents` — those with a
`vmId` or `deploymentStatus`). **Scope** `deploys:read`. Paginated.

**Response** `data: { deploys: Array<{ id, name, vmProvider?, vmId?, region?, deploymentStatus?, harness?, status }>, cursor, hasMore }`

### `GET /api/v1/tasks`
List tasks in the Space. **Scope** `tasks:read`. Paginated.

**Response** `data: { tasks: Array<{ id, title, status, priority }>, cursor, hasMore }`

### `POST /api/v1/tasks`
Create a task. **Scope** `tasks:write`.

**Body** `{ title: string, description?: string }`
**Response** `data: { id }` — `201`

### `PATCH /api/v1/tasks/{id}`
Partial update — only the fields you pass are changed. **Scope** `tasks:write`.

**Body** `{ title?: string, description?: string, status?: "todo" | "in_progress" | "blocked" | "done" }`
**Response** `data: { id }`, or `404` if the id doesn't exist or isn't in this
key's Space, `400` for an invalid `status`.

### `POST /api/v1/messages`
Post a message, creating a new thread (or reusing context — see SDK notes).
**Scope** `messages:write`.

**Body** `{ content: string, threadTitle?: string }`
**Response** `data: { threadId }` — `201`

### `GET /api/v1/workflows`
List workflows in the Space. **Scope** `workflows:read`. Paginated.

**Response** `data: { workflows: Array<{ id, name, enabled, stepCount, updatedAt }>, cursor, hasMore }`

### `POST /api/v1/workflows/run`
Start a workflow run. **Scope** `workflows:write`.

**Body** `{ workflowId: string }`
**Response** `data: { runId }` — `201`

### `POST /api/v1/workflows/{id}/toggle`
Enable or disable a workflow. A disabled workflow never starts new runs from
its triggers (existing in-flight runs are unaffected). **Scope**
`workflows:write`.

**Body** `{ enabled: boolean }`
**Response** `data: { id, enabled }`, or `404` if the id doesn't exist or
isn't in this key's Space.

### `GET /api/v1/workflows/runs?workflowId=...`
List recent workflow runs, optionally scoped to one workflow via the
`workflowId` query param. **Scope** `workflows:read`. Paginated (the
`workflowId` filter is applied client-side of the page read, so a page may
come back sparse before `hasMore` goes `false` — keep following `cursor`).

**Response** `data: { runs: Array<{ id, workflowId, status, startedAt, finishedAt? }>, cursor, hasMore }`

### `GET /api/v1/approvals?status=pending|approved|rejected`
List approval gates in the Space, optionally filtered by status. **Scope**
`approvals:read`. Paginated.

**Response** `data: { approvals: Array<{ id, kind, title, detail?, status, riskLevel?, preview?, deliveredChannels?, createdAt, decidedAt? }>, cursor, hasMore }`

### `POST /api/v1/approvals/{id}/decide`
Approve or reject a pending gate. **Scope** `approvals:write`.

**Body** `{ approve: boolean }`
**Response** `data: { ok: true }`, or `400` if the approval is not pending or
doesn't belong to this key's Space.

### `POST /api/v1/approvals/bulk-decide`
Approve or reject several pending gates in one call. **Scope**
`approvals:write`. Best-effort per row — an already-decided or cross-Space id
lands in `failed` without aborting the rest (capped at 100 ids/request).

**Body** `{ approvalIds: string[], approve: boolean }`
**Response** `data: { succeeded: number, failed: string[] }`

### `GET /api/v1/usage`
Usage for the calling key: today's request/error totals + a per-route
breakdown, plus the current minute's count (useful for backing off before
hitting the rate limit). **Scope** `usage:read`.

**Response**
```json
{
  "data": {
    "today": { "requests": 142, "errors": 3, "routes": { "GET /api/v1/agents": 90, "...": 1 } },
    "currentMinute": { "requests": 4 }
  }
}
```

---

## One-click approval links

`GET /api/v1/approvals/token/{token}` — no API key required. This is the
route behind the "Approve"/"Reject" links delivered by email or webhook when
an approval fires (feature: approval inbox everywhere). The token:

- Is single-use — burned (`usedAt` set) on first successful redemption.
- Is short-lived — matches the approval's `expiresAt` (default 24h).
- Is bound to one decision (`approve` or `deny`) unless minted as `either`, in
  which case pass `?action=approve` or `?action=deny`.

By default it responds with a small HTML confirmation page (meant to be
opened directly from an email client or browser). Pass `?format=json` or send
`Accept: application/json` for a machine-readable response instead:

```json
{ "data": { "approvalId": "...", "decision": "approve" } }
```

or on failure (already used, expired, wrong action):

```json
{ "error": { "code": "token_invalid", "message": "token already used" } }
```

## Delivery channels (email + webhook)

Each Space member configures their own approval delivery channels from
**Dashboard → Approvals → Notifications** (`convex/notifications.ts`):

- **Email** — pluggable provider; set `EMAIL_PROVIDER_URL` +
  `EMAIL_PROVIDER_API_KEY` (and optionally `EMAIL_FROM`) to enable real
  sends. Without them, delivery attempts no-op and are recorded as a
  `workEvent` for observability — approvals still work via the in-app inbox
  and public API.
- **Webhook** — POSTs a JSON payload to the configured URL. If a signing
  secret is set, the request carries `X-Cadre-Signature: sha256=<hmac>`
  (HMAC-SHA256 over the raw JSON body) so receivers can verify authenticity:

  ```json
  {
    "type": "approval.requested",
    "approvalId": "...",
    "title": "...",
    "detail": "...",
    "riskLevel": "high",
    "preview": { "before": "...", "after": "..." },
    "approveUrl": "https://.../api/v1/approvals/token/apt_...",
    "denyUrl": "https://.../api/v1/approvals/token/apt_...",
    "ts": 1737331200000
  }
  ```

  Verify it on receipt with the SDK's `verifyCadreWebhookSignature` helper
  (zero-dep, Web Crypto — works in Node 18+, browsers, and edge runtimes):

  ```ts
  import { verifyCadreWebhookSignature } from "@/sdk/src";

  export async function POST(req: Request) {
    const rawBody = await req.text(); // must be the raw, unparsed body
    const ok = await verifyCadreWebhookSignature(
      rawBody,
      req.headers.get("x-cadre-signature"),
      process.env.CADRE_WEBHOOK_SECRET!,
    );
    if (!ok) return new Response("invalid signature", { status: 401 });
    const payload = JSON.parse(rawBody);
    // ...
  }
  ```

  **Rotating your signing secret.** There is exactly one active secret per
  member per Space (`notificationPrefs.webhookSecretRef`, resolved from the
  Space secrets vault at delivery time) — setting a new one from **Dashboard →
  Approvals → Notifications** overwrites the old value in place, so the very
  next delivery signs with the new secret only. There is no dual-secret /
  grace-period signing (Cadre never sends two signature headers for one
  delivery), so treat rotation as a hard cutover and sequence it like this to
  avoid a window where deliveries fail verification on your end:

  1. Update your receiving endpoint to accept **both** the old and new secret
     (try `verifyCadreWebhookSignature(rawBody, header, oldSecret)`, then the
     new one, before rejecting).
  2. Once that's deployed, update the secret in Cadre's Notifications panel.
  3. Use **Send test** to confirm a delivery verifies against the new secret,
     then remove the old secret from your endpoint's fallback list.

  If you skip step 1, any approval that fires between rotating in Cadre and
  redeploying your receiver will 401 at your endpoint — the approval itself is
  unaffected (delivery is best-effort and failures are audit-logged; you can
  always fall back to the in-app inbox or `GET /api/v1/approvals`), but you'll
  miss the one-click link for that delivery.

## Connector log ingestion

`POST /connector/logs` (agent-token authenticated, not API-key) accepts batches
of structured log lines from a deployed agent/connector: `{ lines: [{ level,
message, source?, seq?, meta?, ts? }] }`, capped at 200 lines/request. Backs
the agent detail log pane (`convex/logs.ts`).

## SDK

```ts
import { CadreClient } from "@/sdk/src";

const cadre = new CadreClient({ apiKey: process.env.CADRE_API_KEY! });
const { agents } = await cadre.agents.list();
```

See `sdk/README.md` for the full client reference.
