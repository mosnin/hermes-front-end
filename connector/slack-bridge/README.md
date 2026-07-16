# Slack Bridge

Relay real Slack messages into a Hermes agent's thread. A Slack app sends message
events to the control plane, which records them on the routed agent's thread;
the agent's reply is posted back into Slack.

## Architecture

```
Slack workspace
   │  (Event Subscriptions: message / app_mention events)
   ▼
Slack app  ──POST──▶  Control plane Slack webhook
                      https://<deployment>.convex.site/bridges/slack/<bridgeId>?secret=<signingSecret>
                          │
                          │  1. verifies ?secret matches the bridge's config.signingSecret
                          │  2. extracts the message text + sender label
                          ▼
                      internal.bridges.handleInbound({ bridgeId, userLabel, text })
                          │
                          │  - loads the bridge (internal.bridges.getById)
                          │  - finds/creates a thread keyed by connectorKey `slack:<bridgeId>`
                          │    on the bridge's routed agentId
                          │  - appends a `user` message:  [<userLabel>] <text>
                          │  - records activity + a work event (category "integration")
                          ▼
                      Routed agent's thread (visible in the dashboard)
                          │
                          │  agent produces a reply
                          ▼
                      Slack chat.postMessage  ◀── posted back with config.botToken
                      (this reply path is wired in a follow-up)
```

Key points:

- **`<bridgeId>`** is the Convex document id of the `bridges` row. It is part of
  the webhook URL so the control plane knows which bridge (and therefore which
  agent, company, and space) an event belongs to.
- **`config.signingSecret`** is passed back as the `?secret=` query param and is
  checked before any event is relayed. Only requests carrying the matching
  secret are accepted.
- **`config.botToken`** is the Slack bot token (`xoxb-...`) used to post the
  agent's reply back into the Slack channel via `chat.postMessage`.
- One Slack bridge maps to exactly one thread (connector key `slack:<bridgeId>`),
  so a back-and-forth conversation stays in a single thread.

## Prerequisites

- A Hermes Chat bridge of type `slack`, already created on the **Chat bridges**
  page and routed to an agent.
- Admin access to a Slack workspace where you can install an app.

## Step 1 — Create the Slack app

1. Go to <https://api.slack.com/apps> and click **Create New App** → **From scratch**.
2. Name it (e.g. `Hermes`), pick the target workspace, and click **Create App**.

## Step 2 — Add bot scopes

1. In the app settings, open **OAuth & Permissions**.
2. Under **Scopes → Bot Token Scopes**, add:
   - `app_mentions:read` — receive events when the bot is @-mentioned.
   - `chat:write` — post the agent's reply back into the channel.
3. Click **Install to Workspace** and approve.
4. Copy the **Bot User OAuth Token** (`xoxb-...`). You'll set this as the
   bridge's `botToken`.

## Step 3 — Find your bridgeId and signing secret

1. Open the **Chat bridges** page in Hermes and select your Slack bridge.
   The **bridgeId** is shown there (it's the Convex id of the bridge row); copy it.
2. Choose a **signing secret**: any sufficiently long random string you control
   (for example, generate one with `openssl rand -hex 32`). This is the shared
   secret the control plane checks on every inbound request — it is *not* the
   Slack app's own "Signing Secret".

## Step 4 — Store the secrets on the bridge config

Set the bridge's `config` to include both values:

```json
{
  "signingSecret": "<the random string from step 3>",
  "botToken": "xoxb-..."
}
```

Use the Chat bridges page (or `bridges.connect` / `setAgent` admin mutations) to
persist this config on the bridge.

## Step 5 — Point Slack at the control plane

1. In the Slack app settings, open **Event Subscriptions** and toggle it **On**.
2. Set the **Request URL** to:

   ```
   https://<deployment>.convex.site/bridges/slack/<bridgeId>?secret=<signingSecret>
   ```

   Replace:
   - `<deployment>` — your Convex deployment name (the `.convex.site` HTTP host).
   - `<bridgeId>` — the id from Step 3.
   - `<signingSecret>` — the secret from Step 3 (URL-encode if needed).

   Slack will send a `url_verification` challenge to confirm the endpoint; the
   control plane responds to it automatically.
3. Under **Subscribe to bot events**, add `app_mention` (and `message.channels`
   if you want all channel messages, not only mentions).
4. **Save Changes** and reinstall the app if Slack prompts you to.

## Step 6 — Test

1. Invite the bot to a channel: `/invite @Hermes`.
2. Mention it: `@Hermes hello`.
3. The message appears as a `[<user>] hello` entry in the routed agent's thread
   on the dashboard, and a `slack_inbound` work event is recorded.

## Reply path (follow-up)

The inbound direction (Slack → agent thread) is fully wired by
`internal.bridges.handleInbound`. Posting the agent's reply back to Slack via
`chat.postMessage` using `config.botToken` is wired in a follow-up change.
