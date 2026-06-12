// Convex <-> Clerk auth integration.
//
// Set CLERK_JWT_ISSUER_DOMAIN in the Convex deployment environment to your
// Clerk "Issuer" — Convex requires it to be set at deploy time:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-domain
// (find it in Clerk → JWT Templates → "convex" → Issuer).
//
// See: https://docs.convex.dev/auth/clerk
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
