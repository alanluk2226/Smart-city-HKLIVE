"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiGet } from "@/lib/client";
import type { WeatherSnapshot } from "@/lib/providers/weather";

type WeatherContextValue = {
  weather: WeatherSnapshot | null;
  loading: boolean;
  refresh: () => void;
};

const WeatherContext = createContext<WeatherContextValue | null>(null);

let shared: WeatherSnapshot | null = null;
let sharedAt = 0;
let sharedInflight: Promise<WeatherSnapshot> | null = null;
const CLIENT_TTL_MS = 5 * 60 * 1000;

async function loadSharedWeather(force = false): Promise<WeatherSnapshot> {
  const now = Date.now();
  if (!force && shared && now - sharedAt < CLIENT_TTL_MS) return shared;
  if (!force && sharedInflight) return sharedInflight;

  sharedInflight = apiGet<WeatherSnapshot>("/api/weather")
    .then((data) => {
      shared = data;
      sharedAt = Date.now();
      return data;
    })
    .finally(() => {
      sharedInflight = null;
    });
  return sharedInflight;
}

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(shared);
  const [loading, setLoading] = useState(!shared);

  const refresh = useCallback((force = false) => {
    setLoading(true);
    loadSharedWeather(force)
      .then(setWeather)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh(false);
    const id = window.setInterval(() => refresh(true), CLIENT_TTL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const value = useMemo(
    () => ({ weather, loading, refresh: () => refresh(true) }),
    [weather, loading, refresh],
  );

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeather() {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    throw new Error("useWeather must be used within WeatherProvider");
  }
  return ctx;
}

/** Safe for components that may render outside the provider (tests / edge). */
export function useOptionalWeather(): WeatherContextValue | null {
  return useContext(WeatherContext);
}
