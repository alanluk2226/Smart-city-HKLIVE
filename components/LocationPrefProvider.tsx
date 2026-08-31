"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  getLocationEnabled,
  persistLocationEnabled,
  readStoredLocationEnabled,
  setLocationEnabledMemory,
} from "@/lib/location-pref";

type LocationPrefContextValue = {
  locationEnabled: boolean;
  setLocationEnabled: (enabled: boolean) => void;
};

const LocationPrefContext = createContext<LocationPrefContextValue | null>(null);

export function LocationPrefProvider({ children }: { children: React.ReactNode }) {
  const [locationEnabled, setLocationEnabledState] = useState(true);

  useLayoutEffect(() => {
    const stored = readStoredLocationEnabled();
    setLocationEnabledState(stored);
    setLocationEnabledMemory(stored);
  }, []);

  const setLocationEnabled = useCallback((enabled: boolean) => {
    setLocationEnabledState(enabled);
    setLocationEnabledMemory(enabled);
    persistLocationEnabled(enabled);
  }, []);

  const value = useMemo(
    () => ({ locationEnabled, setLocationEnabled }),
    [locationEnabled, setLocationEnabled],
  );

  return (
    <LocationPrefContext.Provider value={value}>{children}</LocationPrefContext.Provider>
  );
}

export function useLocationPref() {
  const ctx = useContext(LocationPrefContext);
  if (!ctx) throw new Error("useLocationPref 必須在 LocationPrefProvider 內使用");
  return ctx;
}

/** Safe for optional use outside provider (defaults to memory / true). */
export function useLocationEnabled() {
  const ctx = useContext(LocationPrefContext);
  return ctx?.locationEnabled ?? getLocationEnabled();
}
