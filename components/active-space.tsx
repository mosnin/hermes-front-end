"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export type Role = "viewer" | "operator" | "admin" | "owner";

type SpaceInfo = {
  _id: Id<"spaces">;
  name: string;
  slug: string;
  role: Role;
  autonomyPaused: boolean;
  shadowMode?: boolean;
};

type ActiveSpaceValue = {
  spaceId: Id<"spaces"> | null;
  spaces: SpaceInfo[];
  active: SpaceInfo | null;
  role: Role | null;
  setSpace: (id: Id<"spaces">) => void;
  loading: boolean;
};

const Ctx = createContext<ActiveSpaceValue>({
  spaceId: null,
  spaces: [],
  active: null,
  role: null,
  setSpace: () => {},
  loading: true,
});

const RANK: Record<Role, number> = { viewer: 1, operator: 2, admin: 3, owner: 4 };

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const spaces = useQuery(api.spaces.listMine);
  const ensureDefault = useMutation(api.spaces.ensureDefault);
  const [activeId, setActiveId] = useState<Id<"spaces"> | null>(null);
  const [ensured, setEnsured] = useState(false);

  // Bootstrap a Default Space for brand-new accounts.
  useEffect(() => {
    if (spaces !== undefined && spaces.length === 0 && !ensured) {
      setEnsured(true);
      ensureDefault({});
    }
  }, [spaces, ensured, ensureDefault]);

  // Pick the active Space (persisted across reloads).
  useEffect(() => {
    if (!spaces || spaces.length === 0) return;
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("activeSpaceId")
        : null;
    const exists = saved && spaces.find((s) => s._id === saved);
    setActiveId(((exists ? saved : spaces[0]._id) as Id<"spaces">) ?? null);
  }, [spaces]);

  const setSpace = (id: Id<"spaces">) => {
    if (typeof window !== "undefined") localStorage.setItem("activeSpaceId", id);
    setActiveId(id);
  };

  const active = spaces?.find((s) => s._id === activeId) ?? null;

  return (
    <Ctx.Provider
      value={{
        spaceId: activeId,
        spaces: spaces ?? [],
        active,
        role: active?.role ?? null,
        setSpace,
        loading: spaces === undefined,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useActiveSpace = () => useContext(Ctx);

/** True if the caller's role meets the minimum. */
export function useCan(min: Role): boolean {
  const { role } = useActiveSpace();
  return role ? RANK[role] >= RANK[min] : false;
}
