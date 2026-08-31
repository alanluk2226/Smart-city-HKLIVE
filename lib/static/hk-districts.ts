/** Hong Kong Island / Kowloon / New Territories + 18 districts (display order). */
export const HK_REGION_ORDER = ["香港島", "九龍", "新界"] as const;

export type HkRegion = (typeof HK_REGION_ORDER)[number];

export const HK_DISTRICT_ORDER: Record<HkRegion, string[]> = {
  香港島: ["中西區", "灣仔區", "東區", "南區"],
  九龍: ["油尖旺區", "深水埗區", "九龍城區", "黃大仙區", "觀塘區"],
  新界: ["荃灣區", "屯門區", "元朗區", "北區", "大埔區", "沙田區", "西貢區", "葵青區", "離島區"],
};

function stripDistrictSuffix(raw: string) {
  return raw.replace(/區$/, "").replace(/\s+/g, "").trim();
}

/** Normalize open-data labels like「大埔」／「大埔區」to the canonical「大埔區」. */
export function canonicalDistrict(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const n = stripDistrictSuffix(raw);
  for (const list of Object.values(HK_DISTRICT_ORDER)) {
    for (const d of list) {
      if (stripDistrictSuffix(d) === n) return d;
    }
  }
  return null;
}

export function regionForDistrict(raw: string | null | undefined): HkRegion | null {
  const d = canonicalDistrict(raw);
  if (!d) return null;
  for (const region of HK_REGION_ORDER) {
    if (HK_DISTRICT_ORDER[region].includes(d)) return region;
  }
  return null;
}

export function districtMatches(rowDistrict: string, selected: string) {
  const a = canonicalDistrict(rowDistrict);
  const b = canonicalDistrict(selected);
  if (a && b) return a === b;
  return stripDistrictSuffix(rowDistrict) === stripDistrictSuffix(selected);
}

export type DistrictFacet = { district: string; count: number };
export type RegionFacet = {
  region: string;
  count: number;
  districts: DistrictFacet[];
};

export function buildRegionFacets(items: Array<{ district: string }>): RegionFacet[] {
  const byRegion = new Map<string, Map<string, number>>();
  for (const item of items) {
    const district = canonicalDistrict(item.district);
    const region = district ? regionForDistrict(district) : null;
    if (!district || !region) continue;
    if (!byRegion.has(region)) byRegion.set(region, new Map());
    const dist = byRegion.get(region)!;
    dist.set(district, (dist.get(district) ?? 0) + 1);
  }

  return HK_REGION_ORDER.filter((r) => byRegion.has(r)).map((region) => {
    const distMap = byRegion.get(region)!;
    const preferred = HK_DISTRICT_ORDER[region];
    const districts = [...distMap.entries()]
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => {
        const ia = preferred.indexOf(a.district);
        const ib = preferred.indexOf(b.district);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.district.localeCompare(b.district, "zh-Hant");
      });
    return {
      region,
      count: districts.reduce((n, d) => n + d.count, 0),
      districts,
    };
  });
}
