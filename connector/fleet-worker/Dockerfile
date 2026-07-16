# Hermes agent container image.
#
# Runs ONE Hermes connector agent (connector/control_plane/agent_runtime.py).
# The agent is outbound-only: it dials the control plane using the env vars the
# fleet Worker injects at boot (HERMES_CONTROL_PLANE_URL, HERMES_CONNECTOR_TOKEN,
# HERMES_AGENT_MODEL, HERMES_AGENT_NAME) and streams activity back over HTTPS.
#
# IMPORTANT — build context must be the REPO ROOT (hermes-front-end/), because
# this Dockerfile COPYs the connector package that lives one directory up from
# connector/fleet-worker/. wrangler.jsonc sets this via:
#     "image_build_context": "../../"
# To build by hand:
#     docker build -f connector/fleet-worker/Dockerfile -t hermes-agent .
#
# Keep it small: the connector itself is pure standard library; the only Python
# deps come from the agent_runtime's optional LLM calls (made via urllib, so no
# extra packages are strictly required).

FROM python:3.12-slim

# Don't buffer stdout/stderr so logs stream to the Containers dashboard.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Connector runtime deps. requirements.txt is intentionally tiny (stdlib-first);
# copy it first for layer caching, then install. If absent at build time, skip.
COPY connector/requirements.txt /app/connector/requirements.txt
RUN pip install --no-cache-dir -r /app/connector/requirements.txt || true

# Copy the connector control_plane package. We deliberately copy only what the
# agent runtime needs (control_plane) to keep the image small. `connector`
# becomes an implicit namespace package (no __init__.py needed) so the module
# path `connector.control_plane.agent_runtime` resolves from /app.
COPY connector/control_plane/ /app/connector/control_plane/

# Run as a non-root user.
RUN useradd --create-home --uid 10001 agent \
    && chown -R agent:agent /app
USER agent

# A minimal liveness port so Cloudflare Containers can health-check readiness.
# The connector has no real HTTP server, so we expose a stub responder that the
# entrypoint backgrounds before launching the agent loop. Matches `defaultPort`
# in src/index.ts.
EXPOSE 8080

# Entrypoint: start a tiny liveness server in the background, then run the agent.
# Using `sh -c` keeps the image dependency-free (no extra process supervisor).
CMD ["sh", "-c", "python -m http.server 8080 --bind 0.0.0.0 >/dev/null 2>&1 & exec python -m connector.control_plane.agent_runtime"]
