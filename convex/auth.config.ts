// Convex <-> Clerk auth integration.
//
// The domain must match the "Issuer" of the Clerk JWT template named "convex".
// Set CLERK_JWT_ISSUER_DOMAIN in the Convex deployment environment
// (npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-domain).
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
