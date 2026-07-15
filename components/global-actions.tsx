"use client";

import { ReactNode, useEffect, useState } from "react";
import { RegisterAgentDialog } from "./register-agent-dialog";

/**
 * App-wide action host. Mounts the "connect an agent" dialog once so any
 * surface — the command palette, sidebar, empty states — can trigger it by
 * dispatching the `hermes:connect-agent` window event. Keeps a single source of
 * truth for global actions instead of duplicating the dialog per page.
 */
export function GlobalActionsProvider({ children }: { children: ReactNode }) {
  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    const openConnect = () => setConnectOpen(true);
    window.addEventListener("hermes:connect-agent", openConnect);
    return () => window.removeEventListener("hermes:connect-agent", openConnect);
  }, []);

  return (
    <>
      {children}
      <RegisterAgentDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </>
  );
}

/** Fire a named global action from anywhere. */
export function runGlobalAction(name: "connect-agent") {
  window.dispatchEvent(new Event(`hermes:${name}`));
}
