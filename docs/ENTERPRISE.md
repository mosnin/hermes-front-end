# Enterprise setup — SSO, SCIM, and Stripe billing

The control plane's tenancy key is the Clerk **organization id** (`org_id`,
falling back to the user id for personal workspaces). Every row is scoped to it
and every query resolves membership through `convex/lib/auth.ts`. That means
enterprise identity is configured *in Clerk*, and the app picks it up with no
code changes — users provisioned into an org land in that org's tenant
automatically.

## SSO (SAML / OIDC)

1. Clerk Dashboard → **SSO connections** → *Add connection* → SAML or OIDC.
2. Enter the customer IdP metadata (Okta, Entra ID, Google Workspace, etc.)
   and map the connection to the customer's **Organization**.
3. Enable **enforced SSO** on the organization so members must sign in through
   the IdP.
4. Done — sessions minted through SAML carry the same `org_id`, so tenancy,
   RBAC roles, and plan entitlements all apply unchanged.

The `sso` feature flag is part of the `enterprise` plan (`convex/lib/plans.ts`);
gate any SSO-specific UI with `hasFeature(scope, "sso")`.

## SCIM provisioning

1. Clerk Dashboard → the SSO connection → **SCIM provisioning** → enable.
2. Give the customer the SCIM base URL + bearer token Clerk generates.
3. Their IdP now creates/suspends users and syncs group membership into the
   Clerk organization; deprovisioned users lose access on their next request
   (membership is resolved per-request in `resolveScope`).

## Stripe billing

Plan limits are enforced server-side (`convex/lib/plans.ts`); Stripe makes the
plan *paid*. Configure in the **Convex** env:

```bash
npx convex env set STRIPE_SECRET_KEY sk_live_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
npx convex env set STRIPE_PRICE_TEAM price_...        # recurring price for Team
npx convex env set STRIPE_PRICE_ENTERPRISE price_...  # recurring price for Enterprise
npx convex env set APP_URL https://your-app.vercel.app
```

Then add a webhook endpoint in the Stripe dashboard:

- URL: `https://<deployment>.convex.site/billing/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`

Flow: **Billing page → Upgrade** creates a Stripe Checkout session
(`convex/stripe.ts`), the customer pays on Stripe's hosted page, the webhook
(signature-verified, anti-replay) applies the plan, and cancellation downgrades
back to `free`. Until the env vars are set, the Billing page falls back to the
manual admin plan switch.

## Audit export

`audit.export_` (Ops page → "Export audit") is gated by the enterprise
`audit_export` feature. See `convex/audit.ts`.
