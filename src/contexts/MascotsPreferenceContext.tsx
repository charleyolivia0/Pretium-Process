import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useIsMobile } from "../hooks/useIsMobile";

const STORAGE_KEY = "pretium.mascotsEnabled";

function readStored(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

function writeStored(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, "false");
}

type MascotsPreferenceContextValue = {
  /** Stored user preference. */
  mascotsOn: boolean;
  /** Effective visibility: false on mobile widths regardless of preference. */
  mascotsVisible: boolean;
  setMascotsOn: (next: boolean) => void;
};

const MascotsPreferenceContext = createContext<MascotsPreferenceContextValue | undefined>(undefined);

export function MascotsPreferenceProvider({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.current);
  const setMascotsEnabledMutation = useMutation(api.users.setMascotsEnabled);
  const [mascotsOn, setMascotsOnState] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    setMascotsOnState(readStored());
  }, []);

  useEffect(() => {
    if (user === undefined || user === null) return;
    if (user.mascotsEnabled === false) {
      writeStored(false);
      setMascotsOnState(false);
    } else if (user.mascotsEnabled === true) {
      writeStored(true);
      setMascotsOnState(true);
    }
  }, [user?._id, user?.mascotsEnabled]);

  const setMascotsOn = useCallback(
    (next: boolean) => {
      writeStored(next);
      setMascotsOnState(next);
      void setMascotsEnabledMutation({ enabled: next }).catch(() => {
        /* local preference still applied; backend may be another deployment */
      });
    },
    [setMascotsEnabledMutation],
  );

  const mascotsVisible = mascotsOn && !isMobile;

  const value = useMemo(
    () => ({ mascotsOn, mascotsVisible, setMascotsOn }),
    [mascotsOn, mascotsVisible, setMascotsOn],
  );

  return (
    <MascotsPreferenceContext.Provider value={value}>{children}</MascotsPreferenceContext.Provider>
  );
}

export function useMascotsPreference(): MascotsPreferenceContextValue {
  const ctx = useContext(MascotsPreferenceContext);
  if (!ctx) {
    throw new Error("useMascotsPreference must be used within MascotsPreferenceProvider");
  }
  return ctx;
}
