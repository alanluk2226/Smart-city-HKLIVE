import { getLocationEnabled } from "@/lib/location-pref";

async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { ok?: boolean; error?: string; data?: T };
  try {
    json = JSON.parse(text) as { ok?: boolean; error?: string; data?: T };
  } catch {
    if (res.status === 504 || /timeout|timed out|An error/i.test(text)) {
      throw new Error("伺服器回應逾時，請再試一次。");
    }
    throw new Error(res.ok ? "伺服器回傳格式錯誤" : `伺服器錯誤（${res.status}）`);
  }
  if (!json.ok) throw new Error(json.error || "載入失敗");
  return json.data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  return readApiJson<T>(await fetch(url));
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readApiJson<T>(res);
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

export function useGeo(
  onPos: (lat: number, lng: number) => void,
  onFail?: (message: string) => void,
) {
  return () => {
    const fail = (message: string) => {
      if (onFail) onFail(message);
      else alert(message);
    };
    if (!getLocationEnabled()) {
      fail("已在設定關閉定位。可到設定重新開啟。");
      return;
    }
    if (!navigator.geolocation) {
      fail("這個瀏覽器不支援定位");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onPos(pos.coords.latitude, pos.coords.longitude),
      () => fail("未能取得位置，請檢查定位權限"),
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
