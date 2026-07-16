#!/usr/bin/env bash
# Vercel build entrypoint (kept out of vercel.json because buildCommand is
# capped at 256 chars).
#
# Preferred path: deploy Convex functions and build the frontend with the
# production deployment URL injected (`convex deploy --cmd`).
#
# Fallback: if `convex deploy` fails for an ENV reason — no/expired
# CONVEX_DEPLOY_KEY, or CLERK_JWT_ISSUER_DOMAIN not set in the Convex env — build
# the frontend only against NEXT_PUBLIC_CONVEX_URL so the preview still renders.
# A genuine code/build error fails the fallback too, so real regressions stay
# red; only deploy/env problems degrade to a frontend-only build.

if npx convex deploy --cmd 'npm run build'; then
  exit 0
fi

echo "⚠ convex deploy failed — building the frontend only (set a valid CONVEX_DEPLOY_KEY and CLERK_JWT_ISSUER_DOMAIN to also deploy functions)."
node scripts/gen-generated.mjs
npm run build
