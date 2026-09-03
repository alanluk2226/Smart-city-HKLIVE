import type { EtaResult, OccupancyLevel } from "@/lib/types";

export const GMB_REGION_LABEL: Record<string, string> = {
  HKI: "港島",
  KLN: "九龍",
  NT: "新界",
};

export function GmbRoutePlate({
  route,
  region,
  size = "md",
}: {
  route: string;
  region?: string;
  size?: "sm" | "md";
}) {
  const plate = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm";
  const chip = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]";
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-md bg-[#166534] font-mono font-bold tracking-wide text-white shadow-sm ${plate}`}
      >
        {route}
      </span>
      {region ? (
        <span className={`gmb-region-chip rounded-md font-semibold ${chip}`}>
          綠牌 · {GMB_REGION_LABEL[region] ?? region}
        </span>
      ) : (
        <span className={`gmb-region-chip rounded-md font-semibold ${chip}`}>綠牌</span>
      )}
    </span>
  );
}

export function GmbOccupancyChip({
  occupancy,
  seatsLeft,
}: {
  occupancy?: OccupancyLevel;
  seatsLeft?: number;
}) {
  if (seatsLeft != null && seatsLeft > 0) {
    return (
      <span className="rounded-md border border-lime/40 bg-lime/15 px-1.5 py-0.5 text-[11px] font-medium text-ink">
        剩餘 {seatsLeft} 個空位
      </span>
    );
  }
  if (occupancy === "full" || seatsLeft === 0) {
    return (
      <span className="rounded-md border border-rose/40 bg-rose/15 px-1.5 py-0.5 text-[11px] font-medium text-rose">
        已滿座
      </span>
    );
  }
  if (occupancy === "standing") {
    return (
      <span className="rounded-md border border-amber/40 bg-amber/15 px-1.5 py-0.5 text-[11px] font-medium text-amber">
        只餘企位
      </span>
    );
  }
  if (occupancy === "seats") {
    return (
      <span className="rounded-md border border-lime/40 bg-lime/15 px-1.5 py-0.5 text-[11px] font-medium text-ink">
        有空位
      </span>
    );
  }
  return null;
}

export function GmbEtaExtras({ eta }: { eta: EtaResult }) {
  if (!eta.plate && !eta.occupancy && eta.seatsLeft == null) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {eta.plate ? (
        <span className="rounded-md border border-line bg-elev px-1.5 py-0.5 font-mono text-[11px] text-ink">
          車牌 {eta.plate}
        </span>
      ) : null}
      <GmbOccupancyChip occupancy={eta.occupancy} seatsLeft={eta.seatsLeft} />
    </div>
  );
}
