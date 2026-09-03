"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FavoriteStarButton } from "@/components/transit/FavoriteStarButton";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { apiGet, openWalkingDirections } from "@/lib/client";
import { haversineMeters } from "@/lib/geo";
import { getLocationEnabled } from "@/lib/location-pref";
import {
  ferryFareHint,
  ferryFareShort,
  type FerryFareHint,
} from "@/lib/static/ferry-fares";
import { FERRY_HUBS } from "@/lib/static/ferry-hubs";
import { DUAL_VESSEL_LEG_IDS } from "@/lib/static/ferry-schedules";
import { useSyncActiveTrip } from "@/components/transit/useSyncActiveTrip";
import type { TransitFavorite } from "@/lib/transit-favorites-store";
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

/** Departures this far out are treated as翌日／尾班後估算 */
const NEXT_DAY_MINUTES = 6 * 60;

function isScheduleOnly(row: FerryDeparture) {
  return !row.live || !!row.scheduleEstimate;
}

function sortKey(row: FerryDeparture) {
  const mins = row.departMinutes ?? 10_000;
  return mins * 2 + (isScheduleOnly(row) ? 1 : 0);
}

function formatClockFromMinutes(mins: number) {
  const t = new Date(Date.now() + mins * 60_000);
  return t.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

function clocksAgree(a: string, b: string) {
  const norm = (s: string) => {
    const m = s.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return `${Number(m[1])}:${m[2]}`;
  };
  const na = norm(a);
  const nb = norm(b);
  return na != null && na === nb;
}

/** Beginner-friendly time: countdown first, clock second; keep both consistent. */
function departDisplay(row: FerryDeparture) {
  const mins = row.departMinutes;
  if (mins == null && !row.departTime) {
    return { primary: "暫無班次", secondary: null as string | null, urgent: false };
  }
  if (mins != null && mins <= 0) {
    return {
      primary: "即將開出",
      secondary: row.departTime ? `${row.departTime} 開出` : null,
      urgent: true,
    };
  }
  if (mins != null) {
    const derived = formatClockFromMinutes(mins);
    const clock =
      row.departTime && clocksAgree(row.departTime, derived) ? row.departTime : derived;
    const wait =
      mins < 60
        ? `約 ${mins} 分鐘後`
        : `約 ${Math.floor(mins / 60)} 時 ${mins % 60} 分後`;
    return {
      primary: wait,
      secondary: `${clock} 開出`,
      urgent: mins <= 10,
    };
  }
  return {
    primary: row.departTime ? `${row.departTime} 開出` : "—",
    secondary: null,
    urgent: false,
  };
}

function trustLabel(row: FerryDeparture) {
  return isScheduleOnly(row) ? "非即時" : "即時";
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

function FerrySkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-line bg-elev/40 p-4">
          <div className="h-6 w-32 rounded bg-line/80" />
          <div className="mt-2 h-4 w-40 rounded bg-line/60" />
          <div className="mt-3 h-10 w-24 rounded bg-line/70 ml-auto" />
        </div>
      ))}
    </div>
  );
}

function FerryTicketFares({ fare }: { fare: FerryFareHint }) {
  if (!fare.tickets?.length) {
    return (
      <p className="text-xs leading-snug">
        <span className="text-muted">車費 </span>
        <span className="font-mono text-amber">{fare.label}</span>
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-card/80 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted">車費票種（單程參考）</p>
      <ul className="mt-1.5 space-y-1">
        {fare.tickets.map((row) => (
          <li key={row.role} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="shrink-0 text-muted">{row.role}</span>
            <span className="min-w-0 text-right font-mono text-amber">{row.fare}</span>
          </li>
        ))}
      </ul>
      {fare.ticketNote ? (
        <p className="mt-2 text-[11px] leading-snug text-muted">{fare.ticketNote}</p>
      ) : null}
    </div>
  );
}

export function FerryApp() {
  const [hubId, setHubId] = useState(() => {
    if (typeof window === "undefined") return "central";
    const hub = new URLSearchParams(window.location.search).get("hub")?.trim();
    if (hub && FERRY_HUBS.some((h) => h.id === hub)) return hub;
    return "central";
  });
  const [dataHubId, setDataHubId] = useState<string | null>(null);
  const [hubPickerOpen, setHubPickerOpen] = useState(false);
  const [destFilter, setDestFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("dest")?.trim() || null;
  });
  const [expandedLegId, setExpandedLegId] = useState<string | null>(null);
  const [departures, setDepartures] = useState<FerryDeparture[]>([]);
  const [routeLinks, setRouteLinks] = useState<Array<{ fromHubId: string; toHubId: string }>>([]);
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const locatedOnce = useRef(false);
  const userPickedHub = useRef(
    typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("hub")),
  );
  const [sessionPinned, setSessionPinned] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(new URLSearchParams(window.location.search).get("hub")),
  );
  const dataHubIdRef = useRef<string | null>(null);
  const skipDestReset = useRef(Boolean(destFilter));

  const hub = FERRY_HUBS.find((h) => h.id === hubId) ?? FERRY_HUBS[0]!;
  const showSkeleton = loading && dataHubId !== hubId;
  const showSoftRefresh = refreshing && dataHubId === hubId;

  useSyncActiveTrip(
    sessionPinned || destFilter
      ? {
          kind: "ferry",
          hubId: hub.id,
          hubName: hub.name,
          dest: destFilter ?? undefined,
          label: destFilter ? `渡輪 ${hub.name}→${destFilter}` : `渡輪 ${hub.name}`,
          savedAt: Date.now(),
        }
      : null,
  );

  useEffect(() => {
    if (locatedOnce.current || !navigator.geolocation || !getLocationEnabled()) return;
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
    if (skipDestReset.current) {
      skipDestReset.current = false;
      setExpandedLegId(null);
      return;
    }
    setDestFilter(null);
    setExpandedLegId(null);
  }, [hubId]);

  useEffect(() => {
    setExpandedLegId(null);
  }, [destFilter]);

  useEffect(() => {
    let alive = true;
    const requestedHub = hubId;
    setError("");

    async function load(isInterval: boolean) {
      const soft = isInterval || dataHubIdRef.current === requestedHub;
      if (soft) setRefreshing(true);
      else setLoading(true);

      try {
        const snap = await apiGet<FerrySnapshot>(
          `/api/ferry?hub=${encodeURIComponent(requestedHub)}`,
        );
        if (!alive) return;
        setDepartures(snap.departures);
        setRouteLinks(snap.routeLinks ?? []);
        setWeatherAlert(snap.weatherAlert);
        setUpdatedAt(snap.updatedAt);
        dataHubIdRef.current = requestedHub;
        setDataHubId(requestedHub);
        setLoading(false);
        setRefreshing(false);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "無法載入渡輪班次");
        setLoading(false);
        setRefreshing(false);
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

  const destOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const leg of hub.legs) {
      if (seen.has(leg.to)) continue;
      seen.add(leg.to);
      out.push(leg.to);
    }
    return out;
  }, [hub]);

  const activeDepartures = useMemo(() => {
    if (dataHubId !== hubId) return [];
    let rows = departures.filter((d) => (d.departMinutes ?? 0) >= -1);
    if (destFilter) rows = rows.filter((d) => d.to === destFilter);
    rows = [...rows].sort((a, b) => sortKey(a) - sortKey(b));
    return rows;
  }, [departures, dataHubId, hubId, destFilter]);

  const nextOverview = useMemo(() => {
    const seen = new Set<string>();
    const out: FerryDeparture[] = [];
    for (const row of activeDepartures) {
      if (seen.has(row.legId)) continue;
      seen.add(row.legId);
      out.push(row);
      if (out.length >= 3) break;
    }
    return out;
  }, [activeDepartures]);

  const hasEstimate = useMemo(
    () =>
      activeDepartures.some(
        (d) => isScheduleOnly(d) && (d.departTime != null || d.departMinutes != null),
      ),
    [activeDepartures],
  );

  const serviceState = useMemo(() => {
    if (dataHubId !== hubId || loading) return "ok" as const;
    const timed = activeDepartures.filter((d) => d.departTime != null || d.departMinutes != null);
    if (!timed.length) return "ended" as const;
    if (timed.every((d) => (d.departMinutes ?? 0) >= NEXT_DAY_MINUTES)) return "next_day" as const;
    return "ok" as const;
  }, [activeDepartures, dataHubId, hubId, loading]);

  const grouped = useMemo(() => {
    const map = new Map<string, FerryDeparture[]>();
    for (const d of activeDepartures) {
      const list = map.get(d.legId) ?? [];
      list.push(d);
      map.set(d.legId, list);
    }
    const entries = [...map.entries()].map(([legId, rows]) => {
      const sorted = [...rows].sort((a, b) => sortKey(a) - sortKey(b));
      return [legId, sorted] as const;
    });
    entries.sort((a, b) => sortKey(a[1][0]!) - sortKey(b[1][0]!));
    return entries;
  }, [activeDepartures]);

  const emptyLegs = useMemo(() => {
    if (destFilter) return hub.legs.filter((l) => l.to === destFilter);
    return hub.legs;
  }, [hub, destFilter]);

  function pickHub(id: string) {
    userPickedHub.current = true;
    setSessionPinned(true);
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

      <p className="shrink-0 px-4 py-1.5 text-center text-xs text-muted md:px-0">
        先揀目的地，再睇下一班同碼頭編號
      </p>

      <div
        ref={mapSectionRef}
        className="relative shrink-0 max-md:h-[42%] max-md:min-h-[13rem] md:h-[20rem]"
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
          popupWalkButton={false}
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
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <h2 className="text-xl text-ink">{hub.name}</h2>
                <div className="flex shrink-0 items-center gap-2">
                  <FavoriteStarButton
                    favorite={
                      {
                        kind: "ferry",
                        hubId: hub.id,
                        hubName: hub.name,
                        dest: destFilter ?? undefined,
                        label: destFilter
                          ? `渡輪 ${hub.name}→${destFilter}`
                          : `渡輪 ${hub.name}`,
                        savedAt: Date.now(),
                      } satisfies TransitFavorite
                    }
                  />
                  {updatedAt && dataHubId === hubId ? (
                    <p className="text-xs text-muted">
                      {showSoftRefresh ? "更新中 · " : null}
                      更新{" "}
                      {new Date(updatedAt).toLocaleTimeString("zh-HK", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
              {hasEstimate ? (
                <p className="mt-1 text-[11px] text-amber">
                  「非即時」＝按時間表推算，請以碼頭現場為準
                </p>
              ) : null}
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

          {destOptions.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setDestFilter(null)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition ${
                  destFilter == null ? "border-teal bg-teal/15 text-teal" : "border-line text-muted"
                }`}
              >
                全部目的地
              </button>
              {destOptions.map((dest) => {
                const on = destFilter === dest;
                return (
                  <button
                    key={dest}
                    type="button"
                    onClick={() => setDestFilter(on ? null : dest)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition ${
                      on ? "border-teal bg-teal/15 text-teal" : "border-line text-muted"
                    }`}
                  >
                    {dest}
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

        <div className="space-y-4 p-4">
          {error ? <p className="text-sm text-rose">{error}</p> : null}

          {showSkeleton ? <FerrySkeleton /> : null}

          {!showSkeleton && serviceState === "ended" ? (
            <div className="rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
              暫時未有即將開出嘅船，可能已過今日尾班。請稍後再查或以碼頭公佈為準。
            </div>
          ) : null}

          {!showSkeleton && serviceState === "next_day" ? (
            <div className="rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
              今日班次已大致完結，以下係翌日首班估算。
            </div>
          ) : null}

          {!showSkeleton && nextOverview.length > 0 && serviceState !== "ended" ? (
            <section aria-label="下一班" className="space-y-2.5">
              <h3 className="text-sm font-medium text-ink">下一班</h3>
              <ul className="space-y-2.5">
                {nextOverview.map((row, i) => {
                  const cd = departDisplay(row);
                  const estimate = isScheduleOnly(row);
                  const fareShort = ferryFareShort(row.legId, row.vesselType);
                  return (
                    <li
                      key={`next-${row.legId}-${row.departTime ?? "x"}-${i}`}
                      className="rounded-2xl border border-teal/35 bg-teal/10 px-4 py-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-lg font-medium text-ink">→ {row.to}</p>
                          {row.pier ? (
                            <p className="mt-1.5 text-sm font-medium text-sky">去 {row.pier}</p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-muted">
                            <span
                              className={
                                estimate ? "text-amber" : "text-teal"
                              }
                            >
                              {trustLabel(row)}
                            </span>
                            {row.vesselType === "fast"
                              ? " · 高速船"
                              : row.vesselType === "ordinary"
                                ? " · 普通船"
                                : ""}
                            {fareShort ? (
                              <>
                                {" · "}
                                <span className="font-mono text-amber">{fareShort}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className={`text-lg font-semibold leading-tight ${
                              cd.urgent ? "text-sky" : "text-ink"
                            }`}
                          >
                            {cd.primary}
                          </div>
                          {cd.secondary ? (
                            <div className="mt-0.5 text-xs text-muted">{cd.secondary}</div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {!showSkeleton && grouped.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted">全部航線</h3>
              <ul className="space-y-2">
                {grouped.map(([legId, rows]) => {
                  const head = rows[0]!;
                  const fare = ferryFareHint(legId);
                  const open = expandedLegId === legId;
                  const cd = departDisplay(head);
                  const types = new Set(rows.map((r) => r.vesselType));
                  const showDual =
                    DUAL_VESSEL_LEG_IDS.has(legId) ||
                    (types.has("fast") && types.has("ordinary"));
                  return (
                    <li key={legId} className="rounded-2xl border border-line bg-elev/40">
                      <button
                        type="button"
                        onClick={() => setExpandedLegId(open ? null : legId)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                        aria-expanded={open}
                      >
                        <div className="min-w-0">
                          <p className="text-base text-ink">
                            → {head.to}
                            <span className="ml-2 text-xs text-muted">{head.from} 開出</span>
                          </p>
                          {head.pier ? (
                            <p className="mt-1 text-sm font-medium text-sky">去 {head.pier}</p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] text-muted">
                            {cd.primary}
                            {isScheduleOnly(head) ? " · 非即時" : " · 即時"}
                            {open ? " · 收起詳情" : " · 車費／船型"}
                          </p>
                        </div>
                        <span className="shrink-0 text-muted" aria-hidden>
                          {open ? "▴" : "▾"}
                        </span>
                      </button>

                      {open ? (
                        <div className="space-y-3 border-t border-line px-4 py-3">
                          <p className="text-xs text-muted">
                            {head.operatorName}
                            {head.title ? ` · ${head.title}` : ""}
                          </p>
                          {fare ? <FerryTicketFares fare={fare} /> : null}
                          {showDual ? (
                            <p className="text-xs text-muted">此線有普通船同高速船，票價唔同（見上表）</p>
                          ) : null}
                          <ul className="space-y-2">
                            {rows.map((row, i) => {
                              const rowCd = departDisplay(row);
                              return (
                                <li
                                  key={`${row.legId}-${row.departTime ?? "x"}-${row.vesselCode ?? ""}-${i}`}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3.5 py-3"
                                >
                                  <div className="min-w-0 text-xs text-muted">
                                    <span
                                      className={
                                        isScheduleOnly(row) ? "text-amber" : "text-teal"
                                      }
                                    >
                                      {trustLabel(row)}
                                    </span>
                                    {row.vesselType === "fast"
                                      ? " · 高速船"
                                      : row.vesselType === "ordinary"
                                        ? " · 普通船"
                                        : ""}
                                    {row.remark ? (
                                      <p className="mt-1 leading-snug">{row.remark}</p>
                                    ) : null}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div
                                      className={`text-sm font-medium ${
                                        rowCd.urgent ? "text-sky" : "text-ink"
                                      }`}
                                    >
                                      {rowCd.primary}
                                    </div>
                                    {rowCd.secondary ? (
                                      <div className="mt-0.5 text-[11px] text-muted">
                                        {rowCd.secondary}
                                      </div>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : !showSkeleton && serviceState === "ended" ? (
            <ul className="space-y-2">
              {emptyLegs.map((leg) => (
                <li key={leg.id} className="rounded-2xl border border-line bg-elev/40 px-4 py-3.5">
                  <p className="text-base text-ink">→ {leg.to}</p>
                  {leg.pier ? (
                    <p className="mt-1 text-sm font-medium text-sky">去 {leg.pier}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted">暫無即將開出班次</p>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-[11px] text-muted leading-relaxed">
            用法：揀目的地 → 睇「下一班」 → 展開航線睇成人／小童／長者票價。假日或以閘機為準。
          </p>
        </div>
      </div>
    </div>
  );
}
