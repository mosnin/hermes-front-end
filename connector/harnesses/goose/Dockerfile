# Harness: goose — see connector/harnesses/goose/harness.json
#
# Same connector as the hermes harness, but HERMES_AGENT_FRAMEWORK=goose so
# agent_runtime.py shells out to Block's Goose CLI headlessly for every
# instruction (connector/control_plane/frameworks.py:
# "goose run --no-session --quiet -t {instruction}").
#
# Build context must be the REPO ROOT — see hermes/Dockerfile's note.
#     docker build -f connector/harnesses/goose/Dockerfile -t hermes-agent-goose .
#
# Goose needs a model provider key at runtime (GOOSE_PROVIDER/GOOSE_MODEL or
# its own config) — the fleet worker forwards HERMES_MODEL_API_KEY /
# HERMES_AGENT_MODEL; map those to Goose's expected env in an entrypoint
# wrapper if Goose's own var names ever diverge.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HERMES_AGENT_FRAMEWORK=goose

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates bzip2 \
    && rm -rf /var/lib/apt/lists/*

# Official Goose CLI installer (see https://github.com/block/goose).
RUN curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash \
    && mv /root/.local/bin/goose /usr/local/bin/goose 2>/dev/null || true \
    && goose --version || echo "[build] goose installed (version check unavailable at build time)"

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
