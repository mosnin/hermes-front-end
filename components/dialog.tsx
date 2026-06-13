"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from "react";
import { Button, Input } from "./ui";

type ConfirmOpts = {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
};
type PromptOpts = {
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
};

type DialogApi = {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
};

const DialogCtx = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
});

type State =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState("");

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setState({ kind: "prompt", opts, resolve });
      }),
    [],
  );

  function close(result: boolean | string | null) {
    if (!state) return;
    state.resolve(result as never);
    setState(null);
  }

  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4"
          onClick={() => close(state.kind === "prompt" ? null : false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{state.opts.title}</h2>
            {state.kind === "confirm" && state.opts.body && (
              <p className="mt-2 text-sm text-muted">{state.opts.body}</p>
            )}
            {state.kind === "prompt" && (
              <div className="mt-4">
                {state.opts.label && (
                  <label className="mb-1 block text-xs text-muted">
                    {state.opts.label}
                  </label>
                )}
                <Input
                  autoFocus
                  value={value}
                  placeholder={state.opts.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && close(value)}
                />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => close(state.kind === "prompt" ? null : false)}
              >
                Cancel
              </Button>
              <Button
                variant={state.kind === "confirm" && state.opts.danger ? "danger" : "primary"}
                onClick={() => close(state.kind === "prompt" ? value : true)}
              >
                {state.opts.confirmLabel ??
                  (state.kind === "confirm" ? "Confirm" : "OK")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}

export const useDialog = () => useContext(DialogCtx);
