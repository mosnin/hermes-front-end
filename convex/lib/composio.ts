// Composio REST client (https://composio.dev) — managed OAuth, 250+ tools, and
// triggers. We call the REST API from Convex actions with fetch.
//
// Configure in the Convex deployment env:
//   COMPOSIO_API_KEY        project API key (required to use integrations)
//   COMPOSIO_BASE_URL       optional, defaults to the v3 API
//   COMPOSIO_WEBHOOK_SECRET optional, verifies inbound trigger webhooks
//
// Endpoint paths are centralized here so they're easy to update if the API
// version changes.

const DEFAULT_BASE = "https://backend.composio.dev/api/v3";

function cfg() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Composio is not configured — set COMPOSIO_API_KEY in the Convex env.",
    );
  }
  return { apiKey, base: process.env.COMPOSIO_BASE_URL ?? DEFAULT_BASE };
}

export function composioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  const { apiKey, base } = cfg();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Composio ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

/** Use the Space id as the Composio "user"/entity so connections are isolated. */
export function composioUserId(spaceId: string): string {
  return `space_${spaceId}`;
}

/** Begin an OAuth connection for a toolkit. Returns a redirect URL to complete it. */
export async function createConnection(
  authConfigId: string,
  userId: string,
): Promise<{ id?: string; redirectUrl?: string; status?: string }> {
  const data = await call("POST", "/connected_accounts", {
    auth_config: { id: authConfigId },
    connection: { user_id: userId },
  });
  return {
    id: data.id ?? data.connectedAccountId,
    redirectUrl:
      data.redirect_url ??
      data.redirectUrl ??
      data.connectionData?.val?.redirectUrl,
    status: data.status ?? data.connectionData?.val?.status,
  };
}

/** List a user's connected accounts (to reconcile status). */
export async function listConnections(userId: string): Promise<any[]> {
  const data = await call(
    "GET",
    `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
  );
  return data.items ?? data.data ?? (Array.isArray(data) ? data : []);
}

/** Execute a Composio tool/action on behalf of a user. */
export async function executeTool(
  toolSlug: string,
  userId: string,
  args: Record<string, unknown>,
  connectedAccountId?: string,
): Promise<any> {
  return await call("POST", `/tools/execute/${encodeURIComponent(toolSlug)}`, {
    user_id: userId,
    arguments: args,
    ...(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
  });
}

/** Create or update a trigger instance; events are delivered to our webhook. */
export async function upsertTrigger(
  triggerSlug: string,
  userId: string,
  triggerConfig: Record<string, unknown> = {},
): Promise<any> {
  return await call(
    "POST",
    `/trigger_instances/${encodeURIComponent(triggerSlug)}/upsert`,
    { user_id: userId, trigger_config: triggerConfig },
  );
}
