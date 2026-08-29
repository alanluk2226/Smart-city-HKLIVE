export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as { ok: boolean; error?: string; data: T };
  if (!json.ok) throw new Error(json.error || "載入失敗");
  return json.data;
}

export function formatDistance(meters?: number) {
  if (meters == null) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function waitTone(minutes: number | null) {
  if (minutes == null) return "text-muted";
  if (minutes <= 60) return "text-teal";
  if (minutes <= 180) return "text-amber";
  return "text-rose";
}

export function useGeo(onPos: (lat: number, lng: number) => void) {
  return () => {
    if (!navigator.geolocation) {
      alert("這個瀏覽器不支援定位");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onPos(pos.coords.latitude, pos.coords.longitude),
      () => alert("未能取得位置，請檢查定位權限"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };
}

export function openWalkingDirections(lat: number, lng: number, _name = "") {
  const coords = `${lat},${lng}`;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const url = /iPhone|iPad|iPod/i.test(ua)
    ? `https://maps.apple.com/?daddr=${coords}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}&travelmode=walking`;
  window.open(url, "_blank", "noopener,noreferrer");
}
