# Harness: generic-cli — see connector/harnesses/generic-cli/harness.json
#
# A blank-slate image for wrapping any CLI agent binary that isn't one of the
# curated harnesses. HERMES_AGENT_FRAMEWORK=cli tells agent_runtime.py to shell
# out via CliExecutor, driven entirely by HERMES_AGENT_COMMAND (required —
# the container fails fast at startup if it's unset; see frameworks.py).
#
# Build context must be the REPO ROOT — see hermes/Dockerfile's note.
#     docker build -f connector/harnesses/generic-cli/Dockerfile \
#       --build-arg EXTRA_INSTALL='pip install my-agent-cli' \
#       -t hermes-agent-generic-cli .
#
# Customize by passing EXTRA_INSTALL (a shell command run at build time) to
# pull in whatever binary HERMES_AGENT_COMMAND will invoke — no need to fork
# this file for common cases (pip/npm/curl installs). For anything heavier,
# copy this Dockerfile into a new connector/harnesses/<id>/ directory instead
# of overloading generic-cli, and register it per docs/HARNESS_SPEC.md.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HERMES_AGENT_FRAMEWORK=cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG EXTRA_INSTALL=""
RUN if [ -n "$EXTRA_INSTALL" ]; then sh -c "${EXTRA_INSTALL}"; fi

WORKDIR /app

COPY connector/requirements.txt /app/connector/requirements.txt
RUN pip install --no-cache-dir -r /app/connector/requirements.txt || true

COPY connector/control_plane/ /app/connector/control_plane/

RUN useradd --create-home --uid 10001 agent \
    && chown -R agent:agent /app
USER agent

EXPOSE 8080

CMD ["sh", "-c", "python -m http.server 8080 --bind 0.0.0.0 >/dev/null 2>&1 & exec python -m connector.control_plane.agent_runtime"]
