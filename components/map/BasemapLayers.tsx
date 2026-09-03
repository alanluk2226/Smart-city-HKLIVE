"use client";

import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useTheme } from "@/components/ThemeProvider";
import { pauseGoogleMaps } from "@/lib/google-maps-pause";
import { getGoogleMapsApiKey, loadGoogleMapsApi } from "@/lib/googleMaps";
import {
  GOOGLE_DARK_STYLES,
  OSM_BASEMAP_ATTR,
  OSM_BASEMAP_MAX_ZOOM,
  OSM_BASEMAP_URL,
} from "@/lib/mapTiles";
import type { ThemeMode } from "@/lib/theme";

const GOOGLE_MUTANT_SCRIPT =
  "https://unpkg.com/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js";

/** Standard OSM — free, detailed; same tiles in light/dark (no API key). */
function OsmBasemap() {
  return (
    <TileLayer
      url={OSM_BASEMAP_URL}
      maxZoom={OSM_BASEMAP_MAX_ZOOM}
      maxNativeZoom={OSM_BASEMAP_MAX_ZOOM}
      attribution={OSM_BASEMAP_ATTR}
    />
  );
}

type MutantLayer = L.GridLayer & {
  addGoogleLayer: (name: "TransitLayer" | "TrafficLayer" | "BicyclingLayer") => MutantLayer;
};

function loadClassicScript(src: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "1") {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`載入失敗：${src}`)), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`載入失敗：${src}`));
    document.head.appendChild(script);
  });
}

async function createGoogleMutant(theme: ThemeMode): Promise<MutantLayer> {
  const g = window as typeof window & { L?: typeof L };
  g.L = L;

  await loadClassicScript(GOOGLE_MUTANT_SCRIPT, "hk-city-live-google-mutant");

  const leaflet = g.L ?? L;
  const options = {
    type: "roadmap" as const,
    maxZoom: 21,
    maxNativeZoom: 21,
    styles: theme === "dark" ? GOOGLE_DARK_STYLES : undefined,
  };

  const factory = (
    leaflet as unknown as {
      gridLayer?: { googleMutant?: (opts: object) => MutantLayer };
    }
  ).gridLayer?.googleMutant;

  if (factory) {
    return factory(options);
  }

  const Ctor = (
    leaflet as unknown as { GridLayer?: { GoogleMutant?: new (opts: object) => MutantLayer } }
  ).GridLayer?.GoogleMutant;

  if (!Ctor) throw new Error("Leaflet.GoogleMutant 未能掛到 Leaflet");

  return new Ctor(options);
}

function GoogleBasemap({ theme }: { theme: ThemeMode }) {
  const map = useMap();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [theme]);

  useEffect(() => {
    let layer: L.GridLayer | null = null;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let timer: number | undefined;

    const fail = (hint: string, err?: unknown) => {
      if (cancelled) return;
      console.warn("Google 地圖載入失敗，改用 OpenStreetMap", hint, err);
      pauseGoogleMaps(
        "Google 地圖配額／金鑰暫時不可用，已改用免費 OpenStreetMap 底圖。",
      );
      setFailed(true);
    };

    const previousAuthFailure = (window as unknown as { gm_authFailure?: () => void })
      .gm_authFailure;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      try {
        previousAuthFailure?.();
      } catch {
        /* ignore */
      }
      fail("gm_authFailure（配額或金鑰被拒）");
    };

    void (async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled) return;

        const mutant = await createGoogleMutant(theme);
        if (cancelled) return;

        mutant.addGoogleLayer("TransitLayer");
        mutant.addTo(map);
        layer = mutant;

        timer = window.setTimeout(() => {
          if (cancelled) return;
          const errNode = document.querySelector(".gm-err-container");
          if (errNode) {
            try {
              if (layer && map.hasLayer(layer)) map.removeLayer(layer);
            } catch {
              /* map already torn down */
            }
            fail(
              "Google 拒絕載入地圖。請確認已啟用 Maps JavaScript API、帳單已開，以及 API key 網址限制包含 http://localhost:3000/* 同 https://hk-city-live.vercel.app/*",
            );
          }
        }, 2500);

        observer = new MutationObserver(() => {
          if (document.querySelector(".gm-err-container")) {
            try {
              if (layer && map.hasLayer(layer)) map.removeLayer(layer);
            } catch {
              /* map already torn down */
            }
            fail(
              "Google 拒絕載入地圖。請確認已啟用 Maps JavaScript API、帳單已開，以及 API key 網址限制正確",
            );
            observer?.disconnect();
          }
        });
        try {
          observer.observe(map.getContainer(), { childList: true, subtree: true });
        } catch {
          observer.disconnect();
          observer = null;
        }
      } catch (err) {
        fail("載入 Google Maps 腳本或外掛失敗", err);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      observer?.disconnect();
      const g = window as unknown as { gm_authFailure?: () => void };
      if (g.gm_authFailure) {
        if (previousAuthFailure) g.gm_authFailure = previousAuthFailure;
        else delete g.gm_authFailure;
      }
      try {
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      } catch {
        /* map already torn down during rapid route swaps */
      }
    };
  }, [map, theme]);

  if (failed) return <OsmBasemap />;
  return null;
}

/**
 * Google roadmap (+ transit, theme-styled) when API key is set;
 * otherwise free OSM (same detailed tiles in light/dark — Carto free dark tiles now need a key).
 */
export function BasemapLayers() {
  const { theme } = useTheme();
  const key = getGoogleMapsApiKey();
  if (key) return <GoogleBasemap theme={theme} />;
  return <OsmBasemap />;
}

export function mapMaxZoom() {
  return getGoogleMapsApiKey() ? 21 : OSM_BASEMAP_MAX_ZOOM;
}
