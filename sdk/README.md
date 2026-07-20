# @cadre/sdk

Zero-dependency TypeScript client for the Cadre public API (`/api/v1/*`).

## Install

This package currently ships as source inside the Cadre repo (`sdk/`). Import
it directly, or copy `sdk/src/*` into your project — it has no runtime
dependencies beyond `fetch`.

```ts
import { CadreClient } from "@/sdk/src";
```

## Quick start

```ts
import { CadreClient } from "@/sdk/src";

const cadre = new CadreClient({
  apiKey: process.env.CADRE_API_KEY!, // hk_... minted in Dashboard → Developer
  baseUrl: "https://<your-deployment>.convex.site", // your Convex HTTP Actions URL
});

const { agents } = await cadre.agents.list();
console.log(agents.map((a) => `${a.name} (${a.status})`));
```

## Auth

Every request carries `Authorization: Bearer hk_...`. Keys are minted from
Dashboard → Developer (`convex/apiKeys.ts`) and can be scoped with an optional
per-minute rate limit, expiry, and a `scopes` allow-list (e.g.
`["tasks:read", "tasks:write"]` — see `ApiScope` in `sdk/src/types.ts` for
the full list, or `docs/API.md`'s scopes table). A revoked, expired, or
malformed key gets a `401`; a scoped key calling outside its scope list gets
a `403` with `{ error: { code: "forbidden", ... } }`.

## Error handling

Every non-2xx response throws `CadreApiError`:

```ts
import { CadreApiError } from "@/sdk/src";

try {
  await cadre.tasks.create({ title: "" });
} catch (e) {
  if (e instanceof CadreApiError) {
    console.error(e.code, e.status, e.message); // e.g. "bad_request" 400 "title required"
  }
}
```

Rate limits (`429`) come back as `CadreApiError` with `code: "rate_limited"`;
the underlying HTTP response also sets `Retry-After: 60` and
`X-RateLimit-Limit` headers if you're working against the raw REST API instead
of this client.

## API surface

```ts
// Agents (paginated — see "Pagination" below)
await cadre.agents.list();
await cadre.agents.get("agentId"); // single-agent detail

// Fleet deploys (agents provisioned onto a VM)
await cadre.deploys.list();

// Tasks
await cadre.tasks.list();
await cadre.tasks.create({ title: "Draft Q3 plan", description: "..." });
await cadre.tasks.update("taskId", { status: "in_progress" }); // partial update

// Messages (posts into a new or existing thread)
await cadre.messages.send({ content: "Kick off the outreach run" });

// Workflows
await cadre.workflows.list();
await cadre.workflows.run({ workflowId: "..." });
await cadre.workflows.toggle("workflowId", false); // pause; true to re-enable
await cadre.workflows.runs(); // all runs
await cadre.workflows.runs("workflowId"); // scoped to one workflow

// Approvals (human-in-the-loop gates)
await cadre.approvals.list(); // all
await cadre.approvals.list("pending");
await cadre.approvals.decide("approvalId", true); // approve
await cadre.approvals.decide("approvalId", false); // reject
await cadre.approvals.bulkDecide(["id1", "id2"], true); // approve several at once

// Usage (today's request/error counts + per-route breakdown for your key)
await cadre.usage.get();
```

## Pagination

Every `list()` method above returns `{ cursor, hasMore, ...data }` and
accepts an optional `{ cursor, limit }` (max/default `50`) as its trailing
argument:

```ts
let cursor: string | null | undefined;
const allTasks = [];
do {
  const page = await cadre.tasks.list({ cursor, limit: 50 });
  allTasks.push(...page.tasks);
  cursor = page.cursor;
} while (cursor);
```

`workflows.runs()` and `approvals.list()` take pagination options as their
second argument, after their existing filter (`workflowId` / `status`):

```ts
await cadre.approvals.list("pending", { limit: 20 });
await cadre.workflows.runs("workflowId", { cursor });
```

See `docs/API.md` at the repo root for the full REST reference (every route,
request/response shape, status codes) if you'd rather call the HTTP API
directly from another language.

## One-click approval links

Approvals opened with a delivery channel configured (email/webhook — see
Dashboard → Approvals → Notifications) come with a signed, single-use
`approveUrl` / `denyUrl` pointing at
`GET /api/v1/approvals/token/{token}`. These don't need an API key — the token
itself is the credential — and are meant to be followed directly (they render
a small confirmation page). Pass `?format=json` or `Accept: application/json`
to get a JSON response instead, e.g. for a Slack/webhook "Approve" button.

## Verifying inbound webhooks

If you configured a webhook channel with a signing secret (Dashboard →
Approvals → Notifications), Cadre signs each push with
`X-Cadre-Signature: sha256=<hmac>`. Verify it with `verifyCadreWebhookSignature`
before trusting the payload:

```ts
import { verifyCadreWebhookSignature } from "@/sdk/src";

export async function POST(req: Request) {
  const rawBody = await req.text(); // must be the raw, unparsed body — do not
                                     // re-serialize a parsed object, the byte-
                                     // for-byte body is what was signed
  const ok = await verifyCadreWebhookSignature(
    rawBody,
    req.headers.get("x-cadre-signature"),
    process.env.CADRE_WEBHOOK_SECRET!,
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  const payload = JSON.parse(rawBody);
  // payload.type === "approval.requested" | "test"
}
```

Comparison is constant-time (no early-exit on the first mismatched byte), so
a malformed or forged signature can't be brute-forced via response timing.

## Design notes

- **Zero dependencies.** Ships as plain TypeScript using the global `fetch`;
  works in Node 18+, browsers, Deno, and edge runtimes without a build step.
- **Typed responses.** Every method returns the same shape the REST endpoint's
  `data` envelope carries — see `sdk/src/types.ts`.
- **Consistent errors.** Every failure throws `CadreApiError` with a stable
  `code` you can switch on, instead of a bag of possible shapes.
