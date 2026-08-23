export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function etaMinutesFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 60000));
}

export function formatEtaClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

export function dmsToDecimal(raw: string | undefined): number | null {
  if (!raw) return null;
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [d, m, s] = parts;
  return d + m / 60 + s / 3600;
}

export function parseWaitMinutes(text: string): number | null {
  if (!text) return null;
  if (text.includes("少於") && text.includes("分鐘")) return 10;
  const hour = text.match(/([\d.]+)\s*小時/);
  if (hour) return Math.round(parseFloat(hour[1]) * 60);
  const min = text.match(/([\d.]+)\s*分鐘/);
  if (min) return Math.round(parseFloat(min[1]));
  return null;
}

export const DEFAULT_CENTER = { lat: 22.297, lng: 114.172 };
