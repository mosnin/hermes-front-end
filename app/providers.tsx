"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// One client for the whole app. If the env var is missing we surface a clear
// message instead of a cryptic runtime crash.
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-muted">
        <div>
          <p className="text-foreground text-lg font-semibold">
            Convex is not configured
          </p>
          <p className="mt-2 max-w-md text-sm">
            Set <code>NEXT_PUBLIC_CONVEX_URL</code> in <code>.env.local</code>{" "}
            (run <code>npx convex dev</code> to create a deployment).
          </p>
        </div>
      </div>
    );
  }
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
