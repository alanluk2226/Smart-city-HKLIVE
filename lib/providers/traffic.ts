import { cached, TTL } from "@/lib/cache";
import { haversineMeters } from "@/lib/geo";
import { fetchBuffer, fetchText } from "@/lib/http";

export type CctvCamera = {
  key: string;
  region: string;
  district: string;
  description: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  imageUrl: string;
};

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"');
}

export async function getCameras(lat?: number, lng?: number, limit = 24): Promise<CctvCamera[]> {
  const xml = await cached("cctv:xml", TTL.traffic, () =>
    fetchText("https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml"),
  );
  const cameras: CctvCamera[] = [];
  const block = /<image>([\s\S]*?)<\/image>/g;
  let match: RegExpExecArray | null;
  while ((match = block.exec(xml))) {
    const chunk = match[1];
    const grab = (tag: string) => {
      const m = chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decodeXml(m[1].trim()) : "";
    };
    const key = grab("key");
    if (!key) continue;
    cameras.push({
      key,
      region: grab("region"),
      district: grab("district"),
      description: grab("description"),
      lat: Number(grab("latitude")),
      lng: Number(grab("longitude")),
      imageUrl: `/api/traffic/image?key=${encodeURIComponent(key)}`,
    });
  }
  const withDist = cameras.map((c) => ({
    ...c,
    distanceMeters:
      lat != null && lng != null ? haversineMeters(lat, lng, c.lat, c.lng) : undefined,
  }));
  withDist.sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) {
      return a.distanceMeters - b.distanceMeters;
    }
    return a.description.localeCompare(b.description, "zh-Hant");
  });
  return withDist.slice(0, limit);
}

export async function getCameraImage(key: string) {
  const safe = key.replace(/[^A-Za-z0-9]/g, "");
  if (!safe) throw new Error("invalid camera key");
  return fetchBuffer(`https://tdcctv.data.one.gov.hk/${safe}.JPG`);
}
