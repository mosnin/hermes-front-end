import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

/** Boot a Space with one connected agent; return its plaintext token. */
async function boot(org: string) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "u", org_id: org });
  const spaceId = await owner.mutation(api.spaces.create, { name: org });
  const created = await owner.action(api.agents.create, {
    spaceId,
    name: "GW Agent",
  });
  return {
    t,
    owner,
    spaceId,
    agentId: created.agentId as Id<"agents">,
    token: created.token as string,
  };
}

const post = (
  t: ReturnType<typeof convexTest>,
  path: string,
  token: string | null,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  t.fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });

describe("HTTP gateway", () => {
  test("connector endpoints refuse missing and bogus tokens", async () => {
    const { t } = await boot("org_gw1");
    for (const path of [
      "/connector/register",
      "/connector/heartbeat",
      "/connector/message",
      "/connector/secrets",
      "/a2a/send",
      "/a2a/ack",
    ]) {
      const noAuth = await post(t, path, null, {});
      expect(noAuth.status, `${path} without token`).toBe(401);
      const badAuth = await post(t, path, "hk_not_a_real_token", {});
      expect(badAuth.status, `${path} with bogus token`).toBe(401);
    }
  });

  test("register -> heartbeat -> message flow over HTTP with the real token", async () => {
    const { t, agentId, token } = await boot("org_gw2");

    const reg = await post(t, "/connector/register", token, {
      connectorVersion: "0.1.0",
      platform: "test-harness",
      capabilities: ["chat"],
    });
    expect(reg.status).toBe(200);
    const regBody = await reg.json();
    expect(regBody.agentId).toBe(agentId);
    expect(regBody.name).toBe("GW Agent");

    const hb = await post(t, "/connector/heartbeat", token, { status: "online" });
    expect(hb.status).toBe(200);

    // Message with an idempotency key: first accepted, retry deduped.
    const msg = { threadKey: "gw-thread", threadTitle: "GW", content: "hello" };
    const first = await post(t, "/connector/message", token, msg, {
      "Idempotency-Key": "gw-msg-1",
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.threadId).toBeDefined();

    const retry = await post(t, "/connector/message", token, msg, {
      "Idempotency-Key": "gw-msg-1",
    });
    const retryBody = await retry.json();
    expect(retryBody.deduped).toBe(true);
  });

  test("A2A send + ack round-trip over HTTP; guard maps to 429", async () => {
    const { t, owner, spaceId, token } = await boot("org_gw3");
    const other = await owner.action(api.agents.create, {
      spaceId,
      name: "Peer",
    });

    // Send from the token-authenticated agent to the peer by name.
    const send = await post(t, "/a2a/send", token, {
      to: "Peer",
      content: "over the wire",
    });
    expect(send.status).toBe(200);

    // Peer pulls its inbox over HTTP and acks what it processed.
    const peerToken = other.token as string;
    const inbox = await post(t, "/a2a/inbox", peerToken, {});
    const inboxBody = await inbox.json();
    expect(inboxBody.messages.length).toBe(1);
    expect(inboxBody.messages[0].content).toBe("over the wire");

    const ack = await post(t, "/a2a/ack", peerToken, {
      ids: [inboxBody.messages[0].id],
    });
    expect(ack.status).toBe(200);
    expect((await ack.json()).acked).toBe(1);

    // Kill switch on → the gateway surfaces a guard as 429, and the failure is
    // captured in the structured error stream.
    await owner.mutation(api.spaces.setAutonomyPaused, { spaceId, paused: true });
    const blocked = await post(t, "/a2a/send", token, {
      to: "Peer",
      content: "should be refused",
    });
    expect(blocked.status).toBe(429);
    const errors = await owner.query(api.observability.listErrors, { spaceId });
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].kind).toBe("guard_violation");
  });

  test("public API rejects a revoked or malformed key", async () => {
    const { t } = await boot("org_gw4");
    const res = await t.fetch("/api/v1/agents", {
      method: "GET",
      headers: { Authorization: "Bearer hk_deadbeef" },
    });
    expect(res.status).toBe(401);
    const res2 = await t.fetch("/api/v1/agents", { method: "GET" });
    expect(res2.status).toBe(401);
  });
});
