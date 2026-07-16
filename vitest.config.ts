import { defineConfig } from "vitest/config";

// Standard convex-test setup: Convex functions run under the edge-runtime VM,
// and convex-test must be inlined so its source transforms correctly.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
    include: ["convex/**/*.test.ts"],
  },
});
