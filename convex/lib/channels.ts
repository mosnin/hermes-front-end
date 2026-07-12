/**
 * Outbound chat-channel delivery. Turns a bridge (Slack / Telegram / Discord)
 * plus a message into a concrete HTTP request. Kept as a pure function so the
 * per-provider wiring is unit-testable without hitting the network — the
 * action layer (bridges.sendOutbound) just executes what this returns.
 */

export type OutboundRequest =
  | { url: string; headers: Record<string, string>; body: string }
  | { error: string };

export function buildOutboundRequest(
  type: string,
  config: unknown,
  text: string,
): OutboundRequest {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof cfg[k] === "string" ? (cfg[k] as string) : undefined;

  switch (type) {
    case "slack": {
      const token = str("botToken");
      const channel = str("channel");
      if (!token || !channel) {
        return { error: "slack bridge needs config.botToken and config.channel" };
      }
      return {
        url: "https://slack.com/api/chat.postMessage",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel, text }),
      };
    }
    case "telegram": {
      const token = str("botToken");
      const chatId = str("chatId");
      if (!token || !chatId) {
        return { error: "telegram bridge needs config.botToken and config.chatId" };
      }
      return {
        url: `https://api.telegram.org/bot${token}/sendMessage`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      };
    }
    case "discord": {
      const webhook = str("webhookUrl");
      if (!webhook) {
        return { error: "discord bridge needs config.webhookUrl" };
      }
      return {
        url: webhook,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      };
    }
    default:
      return { error: `unsupported bridge type: ${type}` };
  }
}

/**
 * Interpret a provider response. Slack always returns HTTP 200 but signals
 * failure with `{ ok: false, error }` in the JSON body, so a raw status check
 * isn't enough. Returns a normalized {ok, detail}.
 */
export function interpretOutboundResponse(
  type: string,
  status: number,
  bodyText: string,
): { ok: boolean; detail?: string } {
  if (type === "slack") {
    try {
      const parsed = JSON.parse(bodyText) as { ok?: boolean; error?: string };
      return { ok: parsed.ok === true, detail: parsed.error };
    } catch {
      return { ok: false, detail: "unparseable Slack response" };
    }
  }
  // Telegram (200 with {ok:true}) and Discord (204) both signal success by
  // 2xx; treat any 2xx as delivered.
  const ok = status >= 200 && status < 300;
  return { ok, detail: ok ? undefined : `HTTP ${status}` };
}
