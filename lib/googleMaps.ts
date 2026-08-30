function getGoogleMapsApiKey() {
  const key = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
  if (!key) return "";
  // Local/dev: keep free OSM unless explicitly opted in
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_GOOGLE_MAPS !== "1"
  ) {
    return "";
  }
  return key;
}

export { getGoogleMapsApiKey };

function loadClassicScript(src: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
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

let loading: Promise<void> | null = null;

/** Load Maps JS API on window.google (required by Leaflet.GoogleMutant). */
export function loadGoogleMapsApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps 只能在瀏覽器載入"));
  }
  if (window.google?.maps?.Map) return Promise.resolve();

  const key = getGoogleMapsApiKey();
  if (!key) return Promise.reject(new Error("缺少 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));

  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const callbackName = "__hkCityLiveGoogleMapsInit";
      const previous = (window as unknown as Record<string, unknown>)[callbackName];

      (window as unknown as Record<string, unknown>)[callbackName] = () => {
        if (previous !== undefined) {
          (window as unknown as Record<string, unknown>)[callbackName] = previous;
        } else {
          delete (window as unknown as Record<string, unknown>)[callbackName];
        }
        if (window.google?.maps?.Map) resolve();
        else reject(new Error("Google Maps API 已載入但 Map 不可用"));
      };

      const params = new URLSearchParams({
        key,
        v: "weekly",
        language: "zh-HK",
        region: "HK",
        callback: callbackName,
      });

      loadClassicScript(
        `https://maps.googleapis.com/maps/api/js?${params.toString()}`,
        "hk-city-live-google-maps",
      ).catch((err) => {
        loading = null;
        reject(err);
      });
    });
  }

  return loading;
}
