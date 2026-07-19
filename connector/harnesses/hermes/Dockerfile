# Harness: hermes (built-in) — see connector/harnesses/hermes/harness.json
#
# Runs the built-in Hermes agentic LLM loop (connector/control_plane/agent_runtime.py)
# with no external framework installed — HERMES_AGENT_FRAMEWORK is unset/"hermes".
# The agent is outbound-only: it dials the control plane using the env vars the
# fleet worker injects at boot (HERMES_CONTROL_PLANE_URL, HERMES_CONNECTOR_TOKEN,
# HERMES_AGENT_MODEL, HERMES_AGENT_NAME) and streams activity back over HTTPS.
#
# IMPORTANT — build context must be the REPO ROOT (hermes-front-end/), because
# this Dockerfile COPYs the connector package that lives outside connector/harnesses/.
# wrangler.jsonc sets this per-container via "image_build_context": "../../".
# To build by hand:
#     docker build -f connector/harnesses/hermes/Dockerfile -t hermes-agent-hermes .
#
# Keep it small: the connector itself is pure standard library; the only Python
# deps come from the agent_runtime's optional LLM calls (made via urllib, so no
# extra packages are strictly required).

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HERMES_AGENT_FRAMEWORK=hermes

WORKDIR /app

COPY connector/requirements.txt /app/connector/requirements.txt
RUN pip install --no-cache-dir -r /app/connector/requirements.txt || true

# Copy only what the agent runtime needs (control_plane) to keep the image
# small. `connector` becomes an implicit namespace package (no __init__.py
# needed) so `connector.control_plane.agent_runtime` resolves from /app.
COPY connector/control_plane/ /app/connector/control_plane/

RUN useradd --create-home --uid 10001 agent \
    && chown -R agent:agent /app
USER agent

# A minimal liveness port so Cloudflare Containers can health-check readiness
# (see harness.json health.port — must match Container.defaultPort in the
# fleet worker). The connector has no real inbound HTTP server, so we expose
# a stub responder that the entrypoint backgrounds before launching the loop.
EXPOSE 8080

CMD ["sh", "-c", "python -m http.server 8080 --bind 0.0.0.0 >/dev/null 2>&1 & exec python -m connector.control_plane.agent_runtime"]
