"""A2A demo — two agents talking to each other in real time via the broker.

Register TWO agents in the control plane UI, grab both tokens, then run this
with both. The two agents discover each other and exchange a few messages,
which you'll see land live in the dashboard (Agent network + threads + activity).

    export HERMES_CONTROL_PLANE_URL=https://<deployment>.convex.site
    export HERMES_A2A_TOKEN_A=<token for agent A>
    export HERMES_A2A_TOKEN_B=<token for agent B>
    python -m connector.control_plane.a2a_demo

Because the broker is hub-and-spoke (agents only make outbound calls), this
works even when both agents are on laptops behind NAT.
"""

from __future__ import annotations

import os
import time

from .client import ControlPlaneClient

PROMPTS = [
    "Hey, can you pull the latest pricing data?",
    "Got it — sending you the summary now.",
    "Thanks. Anything blocking the nightly run?",
    "Staging creds expired; rotating them.",
    "Great, I'll re-run once you confirm.",
]


def main() -> None:
    base = os.environ["HERMES_CONTROL_PLANE_URL"]
    token_a = os.environ["HERMES_A2A_TOKEN_A"]
    token_b = os.environ["HERMES_A2A_TOKEN_B"]

    a = ControlPlaneClient(base_url=base, token=token_a)
    b = ControlPlaneClient(base_url=base, token=token_b)

    a.register(platform_name="demo", capabilities=["research", "summarize"])
    b.register(platform_name="demo", capabilities=["ops", "deploy"])

    # Discover each other.
    peers_a = a.a2a_discover().get("agents", [])
    peers_b = b.a2a_discover().get("agents", [])
    if not peers_a or not peers_b:
        print("[a2a] need two registered agents to talk — register a second one.")
        return
    b_id = peers_a[0]["id"]
    a_id = peers_b[0]["id"]
    print(f"[a2a] A({a_id[:6]}) <-> B({b_id[:6]}) discovered")

    # Ping-pong a short conversation, polling inboxes between turns.
    for i, line in enumerate(PROMPTS):
        sender, target = (a, b_id) if i % 2 == 0 else (b, a_id)
        sender.a2a_send(to=target, content=line)
        print(f"[a2a] sent: {line}")

        receiver = b if i % 2 == 0 else a
        time.sleep(1.0)
        for msg in receiver.a2a_inbox():
            print(f"[a2a] {msg['from']['name']} received: {msg['content']}")
        time.sleep(1.0)

    print("[a2a] conversation complete — check the dashboard.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[a2a] stopped")
