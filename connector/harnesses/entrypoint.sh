#!/bin/sh
# Shared Docker ENTRYPOINT for every harness image (hermes / openclaw / goose /
# generic-cli). Runs as the container's FIRST process (PID 1) so the security
# policy the fleet worker injected (HERMES_EGRESS_ALLOWLIST / HERMES_FS_QUOTA_MB
# / HERMES_SECRET_SCOPES / HERMES_TOOL_ALLOWLIST / HERMES_CONTAINER_POLICY_JSON)
# is applied -- egress proxy up, netfilter lockdown attempted, fs quota armed,
# secrets filtered -- BEFORE any agent code runs, for every harness alike.
#
# Deliberately a one-line `exec` shim, not where the actual policy logic
# lives (that's connector/control_plane/policy/entrypoint.py, pure Python so
# it's testable and shared with local/dev invocation): `exec` replaces this
# shell's PID with the Python process instead of running it as a child, so
# process signals (SIGTERM on redeploy/stop/OOM) reach the policy-then-agent
# process directly -- no wrapper shell left holding the PID 1 job of
# reaping/forwarding signals it was never built to do.
#
# Whatever the image's Dockerfile CMD is (each harness still ends its own CMD
# with `exec python -m connector.control_plane.agent_runtime`, optionally
# after backgrounding the health-check http.server) is forwarded as this
# script's arguments and becomes the argv entrypoint.py execs once the policy
# is fully applied -- see entrypoint.py:main().
#
# Fails CLOSED: if entrypoint.py determines a configured security policy
# cannot be enforced, it exits non-zero (EXIT_POLICY_REFUSED=90) and this
# script does not fall back to starting the agent some other way -- `set -e`
# plus `exec` means that exit code becomes the container's exit code.
set -e
exec python3 -m connector.control_plane.policy.entrypoint "$@"
