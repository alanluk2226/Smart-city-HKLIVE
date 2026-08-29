"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FareHint } from "@/components/transit/FareHint";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { apiGet, openWalkingDirections } from "@/lib/client";
import { haversineMeters } from "@/lib/geo";
import { ferryFareHint } from "@/lib/static/ferry-fares";
import { FERRY_HUBS } from "@/lib/static/ferry-hubs";
import { DUAL_VESSEL_LEG_IDS } from "@/lib/static/ferry-schedules";
import type { StopHit } from "@/lib/types";

type FerryDeparture = {
  legId: string;
  operator: string;
  operatorName: string;
  title: string;
  from: string;
  to: string;
  pier?: string;
  vesselType: "fast" | "ordinary" | "unknown";
  vesselLabel: string;
  vesselCode?: string;
  departTime: string | null;
  etaTime: string | null;
  departMinutes: number | null;
  remark?: string;
  live: boolean;
  scheduleEstimate?: boolean;
};

type FerrySnapshot = {
  departures: FerryDeparture[];
  routeLinks?: Array<{ fromHubId: string; toHubId: string }>;
  weatherAlert: string | null;
  updatedAt: string;
};

function countdownParts(mins: number | null, departTime: string | null) {
  if (mins == null && !departTime) {
    return { primary: "—", secondary: null as string | null };
  }
  if (mins != null && mins <= 0) {
    return {
      primary: "即將開出",
      secondary: departTime ? `預計下班 ${departTime}` : null,
    };
  }
  if (departTime && mins != null) {
    const wait =
      mins < 60
        ? `約 ${mins} 分鐘後`
        : `約 ${Math.floor(mins / 60)} 時 ${mins % 60} 分後`;
    return {
      primary: `預計下班 ${departTime}`,
      secondary: wait,
    };
  }
  if (departTime) return { primary: `預計下班 ${departTime}`, secondary: null };
  if (mins != null && mins < 60) return { primary: `約 ${mins} 分鐘後`, secondary: null };
  if (mins != null) {
    return {
      primary: `約 ${Math.floor(mins / 60)} 時 ${mins % 60} 分後`,
      secondary: null,
    };
  }
  return { primary: "—", secondary: null };
}

function VesselBadge({ type, label }: { type: FerryDeparture["vesselType"]; label: string }) {
  const cls =
    type === "fast"
      ? "bg-sky/20 text-sky border-sky/30"
      : type === "ordinary"
        ? "bg-teal/15 text-teal border-teal/30"
        : "bg-line text-muted border-line";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] ${cls}`}>{label}</span>
  );
}

function nearestHubId(lat: number, lng: number) {
  let best = FERRY_HUBS[0]!;
  let bestD = Infinity;
  for (const h of FERRY_HUBS) {
    const d = haversineMeters(lat, lng, h.lat, h.lng);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best.id;
}

export function FerryApp() {
  const [hubId, setHubId] = useState("central");
  const [hubPickerOpen, setHubPickerOpen] = useState(false);
  const [departures, setDepartures] = useState<FerryDeparture[]>([]);
  const [routeLinks, setRouteLinks] = useState<Array<{ fromHubId: string; toHubId: string }>>([]);
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const locatedOnce = useRef(false);
  const userPickedHub = useRef(false);

  const hub = FERRY_HUBS.find((h) => h.id === hubId) ?? FERRY_HUBS[0]!;

  useEffect(() => {
    if (locatedOnce.current || !navigator.geolocation) return;
    locatedOnce.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (userPickedHub.current) return;
        setHubId(nearestHubId(pos.coords.latitude, pos.coords.longitude));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120_000 },
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const requestedHub = hubId;
    setDepartures([]);
    setRouteLinks([]);
    setWeatherAlert(null);
    setLoading(true);
    setError("");

    async function load(isRefresh: boolean) {
      if (!isRefresh) setLoading(true);
      try {
        const snap = await apiGet<FerrySnapshot>(
          `/api/ferry?hub=${encodeURIComponent(requestedHub)}`,
        );
        if (!alive) return;
        setDepartures(snap.departures);
        setRouteLinks(snap.routeLinks ?? []);
        setWeatherAlert(snap.weatherAlert);
        setUpdatedAt(snap.updatedAt);
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "無法載入渡輪班次");
        setLoading(false);
      }
    }

    void load(false);
    const id = setInterval(() => void load(true), 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [hubId]);

  const mapStops: StopHit[] = useMemo(
    () =>
      FERRY_HUBS.map((h) => ({
        operator: "ferry",
        operatorName: "渡輪",
        stopId: h.id,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
      })),
    [],
  );

  const mapRouteLinks = useMemo(
    () => routeLinks.map((l) => ({ fromId: l.fromHubId, toId: l.toHubId })),
    [routeLinks],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, FerryDeparture[]>();
    for (const d of departures) {
      const list = map.get(d.legId) ?? [];
      list.push(d);
      map.set(d.legId, list);
    }
    return [...map.entries()];
  }, [departures]);

  function pickHub(id: string) {
    userPickedHub.current = true;
    setHubId(id);
    setHubPickerOpen(false);
  }

  return (
    <div className="flex flex-col max-md:-mx-4 max-md:h-[calc(100dvh-11rem)] max-md:min-h-[32rem]">
      {weatherAlert ? (
        <div
          role="alert"
          className="shrink-0 border-b border-amber/40 bg-amber/10 px-4 py-2.5 text-sm text-amber md:mx-0 md:mb-3 md:rounded-2xl md:border"
        >
          ⚠️ {weatherAlert}
        </div>
      ) : null}

      <p className="shrink-0 px-4 py-1.5 text-center text-xs text-muted md:px-0">喺地圖揀碼頭睇開船時間</p>

      <div
        ref={mapSectionRef}
        className="relative shrink-0 max-md:h-[48%] max-md:min-h-[15rem] md:h-[22rem]"
      >
        <StopStreetMapDynamic
          stops={mapStops}
          selectedId={hubId}
          onSelect={(s) => pickHub(s.stopId)}
          accent="teal"
          showRouteLine={false}
          routeLinks={mapRouteLinks}
          routeLinkColor="#3ee0c5"
          heightClass="h-full"
          className="h-full max-md:rounded-none max-md:border-x-0"
        />
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto rounded-t-2xl border border-line bg-card shadow-[0_-8px_24px_rgba(0,0,0,.25)] max-md:-mt-3 md:mt-0 md:rounded-2xl">
        <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => {
                if (!hubPickerOpen) {
                  mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
                setHubPickerOpen((open) => !open);
              }}
              className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-sky hover:text-ink"
            >
              {hubPickerOpen ? "收起" : "← 改碼頭"}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <h2 className="text-xl text-ink">{hub.name}</h2>
                {updatedAt ? (
                  <p className="text-xs text-muted">
                    更新{" "}
                    {new Date(updatedAt).toLocaleTimeString("zh-HK", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-muted">{hub.nameEn}</p>
            </div>
          </div>

          {hubPickerOpen ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {FERRY_HUBS.map((h) => {
                const on = h.id === hubId;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => pickHub(h.id)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition ${
                      on ? "border-sky bg-sky/15 text-sky" : "border-line text-muted"
                    }`}
                  >
                    {h.name}
                  </button>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => openWalkingDirections(hub.lat, hub.lng, hub.name)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-elev/80 px-3.5 py-2 text-xs text-ink hover:border-sky/70"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-sky"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3 4.5 10.5 12 21l7.5-10.5L12 3Z" />
              <path d="M9.5 11h5" />
              <path d="M12 8.5V15" />
              <path d="M12 15h3.5" />
            </svg>
            前往碼頭
          </button>
        </div>

        <div className="space-y-3 p-4">
          {error ? <p className="text-sm text-rose">{error}</p> : null}
          {loading ? <p className="text-sm text-muted">載入船期…</p> : null}

          {grouped.length
            ? grouped.map(([legId, rows]) => {
                const head = rows[0]!;
                const fare = ferryFareHint(legId);
                const types = new Set(rows.map((r) => r.vesselType));
                const showDual =
                  DUAL_VESSEL_LEG_IDS.has(legId) ||
                  (types.has("fast") && types.has("ordinary"));
                return (
                  <article key={legId} className="rounded-2xl border border-line bg-elev/40 p-4">
                    <div>
                      <h3 className="text-lg text-ink">{head.title}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {head.operatorName}
                        {head.pier ? ` · ${head.pier}` : ""}
                      </p>
                      {fare ? <FareHint className="mt-1.5" label={fare.label} /> : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {showDual ? (
                          <>
                            <VesselBadge type="ordinary" label="普通渡輪" />
                            <VesselBadge type="fast" label="高速船" />
                          </>
                        ) : (
                          <VesselBadge type={head.vesselType} label={head.vesselLabel} />
                        )}
                      </div>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {rows.map((row, i) => {
                        const cd = countdownParts(row.departMinutes, row.departTime);
                        return (
                          <li
                            key={`${row.legId}-${row.departTime ?? "x"}-${row.vesselCode ?? ""}-${i}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-1.5">
                                <VesselBadge type={row.vesselType} label={row.vesselLabel} />
                                {row.vesselCode ? (
                                  <span className="rounded-md bg-line px-2 py-0.5 font-mono text-[11px] text-muted">
                                    {row.vesselCode}
                                  </span>
                                ) : null}
                                {!row.live || row.scheduleEstimate ? (
                                  <span className="rounded-md bg-amber/15 px-2 py-0.5 text-[11px] text-amber">
                                    非實時
                                  </span>
                                ) : null}
                              </div>
                              {row.remark ? (
                                <p className="mt-1.5 text-xs leading-snug text-muted">{row.remark}</p>
                              ) : null}
                            </div>
                            <div className="max-w-[48%] shrink-0 text-right">
                              <div
                                className={`text-sm font-medium leading-snug sm:text-base ${
                                  row.departMinutes != null && row.departMinutes <= 10
                                    ? "text-sky"
                                    : "text-ink"
                                }`}
                              >
                                {cd.primary}
                              </div>
                              {cd.secondary ? (
                                <div className="mt-0.5 text-[11px] text-muted">{cd.secondary}</div>
                              ) : null}
                              {row.etaTime ? (
                                <div className="mt-0.5 text-[11px] text-muted">預計到達 {row.etaTime}</div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })
            : !loading
              ? hub.legs.map((leg) => {
                  const fare = ferryFareHint(leg.id);
                  return (
                    <article key={leg.id} className="rounded-2xl border border-line bg-elev/40 p-4">
                      <h3 className="text-lg text-ink">{leg.title}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {leg.operatorName}
                        {leg.pier ? ` · ${leg.pier}` : ""}
                      </p>
                      {fare ? <FareHint className="mt-1.5" label={fare.label} /> : null}
                      <p className="mt-3 text-sm text-muted">暫無班次資料</p>
                    </article>
                  );
                })
              : null}
          <p className="text-[11px] text-muted leading-relaxed">
            車費為成人單程參考（平日為主）；假日、豪華位或優惠或以碼頭／閘機為準。
          </p>
        </div>
      </div>
    </div>
  );
}
