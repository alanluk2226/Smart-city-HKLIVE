"use client";

import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { getGoogleMapsApiKey, loadGoogleMapsApi } from "@/lib/googleMaps";
import { OSM_BASEMAP_MAX_ZOOM, OSM_BASEMAP_URL } from "@/lib/mapTiles";

const GOOGLE_MUTANT_SCRIPT =
  "https://unpkg.com/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js";

function OsmBasemap() {
  return (
    <TileLayer
      url={OSM_BASEMAP_URL}
      maxZoom={OSM_BASEMAP_MAX_ZOOM}
      maxNativeZoom={OSM_BASEMAP_MAX_ZOOM}
      attribution="&copy; OpenStreetMap"
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

async function createGoogleMutant(): Promise<MutantLayer> {
  const g = window as typeof window & { L?: typeof L };
  g.L = L;

  await loadClassicScript(GOOGLE_MUTANT_SCRIPT, "hk-city-live-google-mutant");

  const leaflet = g.L ?? L;
  const factory = (
    leaflet as unknown as {
      gridLayer?: { googleMutant?: (options: object) => MutantLayer };
      GridLayer?: { GoogleMutant?: new (options: object) => MutantLayer };
    }
  ).gridLayer?.googleMutant;

  if (factory) {
    return factory({ type: "roadmap", maxZoom: 21, maxNativeZoom: 21 });
  }

  const Ctor = (
    leaflet as unknown as { GridLayer?: { GoogleMutant?: new (options: object) => MutantLayer } }
  ).GridLayer?.GoogleMutant;

  if (!Ctor) throw new Error("Leaflet.GoogleMutant 未能掛到 Leaflet");

  return new Ctor({ type: "roadmap", maxZoom: 21, maxNativeZoom: 21 });
}

function GoogleBasemap() {
  const map = useMap();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let layer: L.GridLayer | null = null;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let timer: number | undefined;

    const fail = (hint: string, err?: unknown) => {
      if (cancelled) return;
      console.warn("Google 地圖載入失敗，改用 OpenStreetMap", hint, err);
      setFailed(true);
    };

    void (async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled) return;

        const mutant = await createGoogleMutant();
        if (cancelled) return;

        mutant.addGoogleLayer("TransitLayer");
        mutant.addTo(map);
        layer = mutant;

        // Google often renders a .gm-err-container instead of throwing
        timer = window.setTimeout(() => {
          if (cancelled) return;
          const errNode = document.querySelector(".gm-err-container");
          if (errNode) {
            if (layer && map.hasLayer(layer)) map.removeLayer(layer);
            fail(
              "Google 拒絕載入地圖。請確認已啟用 Maps JavaScript API、帳單已開，以及 API key 網址限制包含 http://localhost:3000/* 同 https://hk-city-live.vercel.app/*",
            );
          }
        }, 2500);

        observer = new MutationObserver(() => {
          if (document.querySelector(".gm-err-container")) {
            if (layer && map.hasLayer(layer)) map.removeLayer(layer);
            fail(
              "Google 拒絕載入地圖。請確認已啟用 Maps JavaScript API、帳單已開，以及 API key 網址限制正確",
            );
            observer?.disconnect();
          }
        });
        observer.observe(map.getContainer(), { childList: true, subtree: true });
      } catch (err) {
        fail("載入 Google Maps 腳本或外掛失敗", err);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      observer?.disconnect();
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    };
  }, [map]);

  if (failed) return <OsmBasemap />;
  return null;
}

/** Google roadmap (+ transit) when API key is set; otherwise free OSM. */
export function BasemapLayers() {
  const key = getGoogleMapsApiKey();
  if (key) return <GoogleBasemap />;
  return <OsmBasemap />;
}

export function mapMaxZoom() {
  return getGoogleMapsApiKey() ? 21 : OSM_BASEMAP_MAX_ZOOM;
}
