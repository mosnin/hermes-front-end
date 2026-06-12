"""Hermes Control Plane connector.

Bridges a deployed Hermes agent (this hermes-webui checkout) to the cloud
control plane (Next.js + Convex). The agent stays where you deployed it — AWS,
GCP, a VM, or your laptop — and this connector registers it with the control
plane and streams its activity up over HTTPS.

See README.md in this directory.
"""

from .client import ControlPlaneClient

__all__ = ["ControlPlaneClient"]
