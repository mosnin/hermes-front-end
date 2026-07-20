# Harness: openclaw — see connector/harnesses/openclaw/harness.json
#
# Same connector as the hermes harness, but HERMES_AGENT_FRAMEWORK=openclaw so
# agent_runtime.py shells out to the OpenClaw CLI for every instruction
# instead of running the built-in LLM loop (connector/control_plane/frameworks.py).
#
# Build context must be the REPO ROOT — see hermes/Dockerfile's note.
#     docker build -f connector/harnesses/openclaw/Dockerfile -t hermes-agent-openclaw .
#
# NOTE: the openclaw package name/registry below is a placeholder for whatever
# the OpenClaw project publishes at build time. Override with
#   --build-arg OPENCLAW_INSTALL='npm install -g @openclaw/cli@<version>'
# to pin a real distribution without editing this file.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HERMES_AGENT_FRAMEWORK=openclaw

# OpenClaw's CLI ships as an npm package — bring in a minimal Node runtime
# alongside the Python connector.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

ARG OPENCLAW_INSTALL="npm install -g openclaw"
RUN sh -c "${OPENCLAW_INSTALL}" \
    && openclaw --version || echo "[build] openclaw installed (version check unavailable at build time)"

WORKDIR /app

COPY connector/requirements.txt /app/connector/requirements.txt
RUN pip install --no-cache-dir -r /app/connector/requirements.txt || true

COPY connector/control_plane/ /app/connector/control_plane/

# Shared policy entrypoint — see hermes/Dockerfile's comment and
# docs/HARNESS_SPEC.md "Container policy (security profiles, feature 17)".
COPY connector/harnesses/entrypoint.sh /app/connector/harnesses/entrypoint.sh
RUN chmod +x /app/connector/harnesses/entrypoint.sh

RUN useradd --create-home --uid 10001 agent \
    && chown -R agent:agent /app
USER agent

EXPOSE 8080

# See hermes/Dockerfile's ENTRYPOINT comment: applies egress/fs-quota/secret
# policy and fails closed before execing CMD.
ENTRYPOINT ["/app/connector/harnesses/entrypoint.sh"]
CMD ["sh", "-c", "python -m http.server 8080 --bind 0.0.0.0 >/dev/null 2>&1 & exec python -m connector.control_plane.agent_runtime"]
