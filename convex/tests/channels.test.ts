import { describe, expect, test } from "vitest";
import {
  buildOutboundRequest,
  interpretOutboundResponse,
} from "../lib/channels";

describe("outbound chat-channel request builder", () => {
  test("slack uses chat.postMessage with bearer auth", () => {
    const r = buildOutboundRequest(
      "slack",
      { botToken: "xoxb-123", channel: "C99" },
      "hi",
    );
    expect("url" in r && r.url).toBe("https://slack.com/api/chat.postMessage");
    if ("url" in r) {
      expect(r.headers.Authorization).toBe("Bearer xoxb-123");
      expect(JSON.parse(r.body)).toEqual({ channel: "C99", text: "hi" });
    }
  });

  test("telegram targets the bot sendMessage URL", () => {
    const r = buildOutboundRequest(
      "telegram",
      { botToken: "111:AAA", chatId: "42" },
      "yo",
    );
    expect("url" in r && r.url).toContain("/bot111:AAA/sendMessage");
    if ("url" in r) expect(JSON.parse(r.body)).toEqual({ chat_id: "42", text: "yo" });
  });

  test("discord posts content to the webhook url", () => {
    const r = buildOutboundRequest(
      "discord",
      { webhookUrl: "https://discord.com/api/webhooks/x/y" },
      "gm",
    );
    expect("url" in r && r.url).toBe("https://discord.com/api/webhooks/x/y");
    if ("url" in r) expect(JSON.parse(r.body)).toEqual({ content: "gm" });
  });

  test("missing config returns a clear error, never a bad request", () => {
    expect(buildOutboundRequest("slack", {}, "x")).toEqual({
      error: "slack bridge needs config.botToken and config.channel",
    });
    expect(buildOutboundRequest("mystery", {}, "x")).toEqual({
      error: "unsupported bridge type: mystery",
    });
  });

  test("slack failure is detected from the 200-but-not-ok body", () => {
    expect(
      interpretOutboundResponse("slack", 200, JSON.stringify({ ok: false, error: "channel_not_found" })),
    ).toEqual({ ok: false, detail: "channel_not_found" });
    expect(
      interpretOutboundResponse("slack", 200, JSON.stringify({ ok: true })),
    ).toEqual({ ok: true, detail: undefined });
    // discord 204 = delivered
    expect(interpretOutboundResponse("discord", 204, "").ok).toBe(true);
  });
});
