/** Approximate published headways for legs without (or missing) live ETA. */

export type HeadwayWindow = {
  /** minutes from midnight */
  startMin: number;
  endMin: number;
  headwayMin: number;
};

export type FerryScheduleRule = {
  windows: HeadwayWindow[];
  vesselType?: "fast" | "ordinary";
  note: string;
};

function hm(h: number, m = 0) {
  return h * 60 + m;
}

/** Star Ferry / island fallback schedules (indicative, not official live). */
export const FERRY_SCHEDULES: Record<string, FerryScheduleRule> = {
  "star-central-tst": {
    note: "天星班次估算（日間約每 8–12 分鐘，以現場為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(6, 30), endMin: hm(10, 0), headwayMin: 8 },
      { startMin: hm(10, 0), endMin: hm(16, 0), headwayMin: 10 },
      { startMin: hm(16, 0), endMin: hm(20, 0), headwayMin: 8 },
      { startMin: hm(20, 0), endMin: hm(23, 30), headwayMin: 12 },
    ],
  },
  "star-tst-central": {
    note: "天星班次估算（日間約每 8–12 分鐘，以現場為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(6, 30), endMin: hm(10, 0), headwayMin: 8 },
      { startMin: hm(10, 0), endMin: hm(16, 0), headwayMin: 10 },
      { startMin: hm(16, 0), endMin: hm(20, 0), headwayMin: 8 },
      { startMin: hm(20, 0), endMin: hm(23, 30), headwayMin: 12 },
    ],
  },
  "star-tst-wanchai": {
    note: "天星班次估算（約每 10–20 分鐘，以現場為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(7, 30), endMin: hm(19, 30), headwayMin: 12 },
      { startMin: hm(19, 30), endMin: hm(22, 30), headwayMin: 20 },
    ],
  },
  "star-wc-tst": {
    note: "天星班次估算（約每 10–20 分鐘，以現場為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(7, 30), endMin: hm(19, 30), headwayMin: 12 },
      { startMin: hm(19, 30), endMin: hm(22, 30), headwayMin: 20 },
    ],
  },
  // Island fallbacks when live feed is empty
  "sun-cecc": {
    note: "新渡輪長洲線班次估算（快／慢船不同，以碼頭公佈為準）",
    windows: [
      { startMin: hm(6, 10), endMin: hm(23, 0), headwayMin: 30 },
    ],
  },
  "sun-ccce": {
    note: "新渡輪長洲線班次估算（快／慢船不同，以碼頭公佈為準）",
    windows: [
      { startMin: hm(5, 30), endMin: hm(22, 30), headwayMin: 30 },
    ],
  },
  "sun-cemw": {
    note: "新渡輪梅窩線班次估算（以碼頭公佈為準）",
    windows: [
      { startMin: hm(6, 10), endMin: hm(23, 0), headwayMin: 40 },
    ],
  },
  "sun-mwce": {
    note: "新渡輪梅窩線班次估算（以碼頭公佈為準）",
    windows: [
      { startMin: hm(5, 55), endMin: hm(22, 40), headwayMin: 40 },
    ],
  },
  "sun-nphh": {
    note: "北角—紅磡班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(7, 0), endMin: hm(19, 30), headwayMin: 20 },
    ],
  },
  "sun-hhnp": {
    note: "紅磡—北角班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(7, 10), endMin: hm(19, 40), headwayMin: 20 },
    ],
  },
  "hkkf-ysk-out": {
    note: "港九小輪班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(6, 30), endMin: hm(23, 0), headwayMin: 45 },
    ],
  },
  "hkkf-ysk-in": {
    note: "港九小輪班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(6, 0), endMin: hm(22, 30), headwayMin: 45 },
    ],
  },
  "hkkf-skw-out": {
    note: "港九小輪班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(7, 0), endMin: hm(22, 0), headwayMin: 90 },
    ],
  },
  "hkkf-skw-in": {
    note: "港九小輪班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(6, 30), endMin: hm(21, 30), headwayMin: 90 },
    ],
  },
  "hkkf-pc-out": {
    note: "港九小輪班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(7, 0), endMin: hm(23, 0), headwayMin: 45 },
    ],
  },
  "hkkf-pc-in": {
    note: "港九小輪班次估算（以碼頭公佈為準）",
    vesselType: "ordinary",
    windows: [
      { startMin: hm(6, 20), endMin: hm(22, 30), headwayMin: 45 },
    ],
  },
};

function formatClock(mins: number) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function nextScheduledDeparture(
  legId: string,
  now = new Date(),
): { departTime: string; departMinutes: number; note: string; vesselType?: "fast" | "ordinary" } | null {
  const rule = FERRY_SCHEDULES[legId];
  if (!rule?.windows.length) return null;

  const tod = now.getHours() * 60 + now.getMinutes();

  const tryWindows = (dayOffset: number) => {
    for (const w of rule.windows) {
      const start = w.startMin;
      const end = w.endMin;
      if (dayOffset === 0 && tod > end) continue;
      let candidate: number;
      if (dayOffset === 0 && tod <= start) {
        candidate = start;
      } else if (dayOffset === 0) {
        const elapsed = tod - start;
        const steps = Math.ceil(elapsed / w.headwayMin);
        candidate = start + steps * w.headwayMin;
        if (candidate <= tod) candidate += w.headwayMin;
        if (candidate > end) continue;
      } else {
        candidate = start;
      }
      const minutes = dayOffset * 24 * 60 + candidate - tod;
      if (minutes < 0) continue;
      return {
        departTime: formatClock(candidate),
        departMinutes: minutes,
        note: rule.note,
        vesselType: rule.vesselType,
      };
    }
    return null;
  };

  return tryWindows(0) ?? tryWindows(1);
}

/** Island routes that commonly run both ordinary + high-speed vessels */
export const DUAL_VESSEL_LEG_IDS = new Set([
  "sun-cecc",
  "sun-ccce",
  "sun-cemw",
  "sun-mwce",
]);
