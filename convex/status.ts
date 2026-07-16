import { query } from "./_generated/server";

/**
 * PUBLIC platform status — intentionally unauthenticated and tenant-free. It
 * reports coarse component health for a public status page and NEVER exposes
 * any tenant data. The only live signal is the maintenance flag; everything
 * else is a declared component whose status reflects maintenance state.
 */
export const page = query({
  args: {},
  handler: async (ctx) => {
    const maint = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", "maintenance_mode"))
      .unique();
    const maintenance = !!maint?.enabled;

    const components = [
      { name: "Control plane API", key: "api" },
      { name: "Real-time transport", key: "transport" },
      { name: "Workflow engine", key: "engine" },
      { name: "Agent-to-agent (A2A)", key: "a2a" },
      { name: "Dashboard", key: "dashboard" },
      { name: "Webhooks & integrations", key: "integrations" },
    ].map((c) => ({
      ...c,
      status: maintenance ? "maintenance" : "operational",
    }));

    return {
      overall: maintenance ? "maintenance" : "operational",
      updatedAt: Date.now(),
      components,
    };
  },
});
