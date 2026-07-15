import { Doc } from "./_generated/dataModel";

// Spec-shaped helpers for the A2A (Agent2Agent) protocol. We expose our agents
// as A2A servers (Agent Card + JSON-RPC) and speak A2A when calling out.

/** Build a spec-shaped Agent Card for one of our agents. */
export function buildAgentCard(agent: Doc<"agents">, rpcUrl: string) {
  return {
    protocolVersion: "0.3.0",
    name: agent.name,
    description: agent.description ?? "An agent on the Cadre control plane.",
    url: rpcUrl,
    preferredTransport: "JSONRPC",
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "Authorization" },
    },
    security: [{ apiKey: [] }],
    skills: (agent.capabilities ?? []).map((c) => ({
      id: c,
      name: c,
      description: `Capability: ${c}`,
      tags: [c],
    })),
  };
}

/** JSON-RPC 2.0 success envelope. */
export function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

/** JSON-RPC 2.0 error envelope. */
export function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Extract concatenated text from an A2A Message's parts. */
export function textFromMessage(message: unknown): string {
  const parts =
    (message as { parts?: { kind?: string; text?: string }[] })?.parts ?? [];
  return parts
    .filter((p) => (p.kind ?? "text") === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** Build an A2A Task object for a recorded inbound message. */
export function buildTask(
  taskId: string,
  contextId: string,
  state: "submitted" | "working" | "completed" | "canceled" | "failed",
  text?: string,
) {
  return {
    id: taskId,
    contextId,
    kind: "task",
    status: {
      state,
      timestamp: new Date().toISOString(),
      ...(text
        ? { message: { role: "agent", parts: [{ kind: "text", text }] } }
        : {}),
    },
  };
}
