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
per-minute rate limit and expiry. A revoked, expired, or malformed key gets a
`401` with `{ error: { code: "unauthorized", ... } }`.

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
// Agents
await cadre.agents.list();

// Fleet deploys (agents provisioned onto a VM)
await cadre.deploys.list();

// Tasks
await cadre.tasks.list();
await cadre.tasks.create({ title: "Draft Q3 plan", description: "..." });

// Messages (posts into a new or existing thread)
await cadre.messages.send({ content: "Kick off the outreach run" });

// Workflows
await cadre.workflows.list();
await cadre.workflows.run({ workflowId: "..." });
await cadre.workflows.runs(); // all runs
await cadre.workflows.runs("workflowId"); // scoped to one workflow

// Approvals (human-in-the-loop gates)
await cadre.approvals.list(); // all
await cadre.approvals.list("pending");
await cadre.approvals.decide("approvalId", true); // approve
await cadre.approvals.decide("approvalId", false); // reject

// Usage (today's request/error counts + per-route breakdown for your key)
await cadre.usage.get();
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

## Design notes

- **Zero dependencies.** Ships as plain TypeScript using the global `fetch`;
  works in Node 18+, browsers, Deno, and edge runtimes without a build step.
- **Typed responses.** Every method returns the same shape the REST endpoint's
  `data` envelope carries — see `sdk/src/types.ts`.
- **Consistent errors.** Every failure throws `CadreApiError` with a stable
  `code` you can switch on, instead of a bag of possible shapes.
