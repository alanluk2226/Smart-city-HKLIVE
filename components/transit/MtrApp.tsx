"use client";

import { useEffect, useMemo, useState } from "react";
import { EtaDialog } from "@/components/transit/EtaDialog";
import { HsrDialog } from "@/components/transit/HsrDialog";
import { MtrSchematicMap } from "@/components/transit/MtrSchematicMap";
import { MtrTripDialog } from "@/components/transit/MtrTripDialog";
import { RacecourseDialog } from "@/components/transit/RacecourseDialog";
import { StationActionDialog } from "@/components/transit/StationActionDialog";
import { useEta } from "@/components/transit/useEta";
import { apiGet } from "@/lib/client";
import {
  MTR_LINE_NAMES,
  MTR_STATIONS,
  isHsrStation,
  isRacecourseStation,
  mtrStation,
} from "@/lib/static/mtr-stations";
import type { RacecourseStatus, StopHit } from "@/lib/types";

function stopFor(code: string): StopHit | null {
  const row = mtrStation(code);
  if (!row) return null;
  return {
    operator: "mtr",
    operatorName: "港鐵",
    stopId: row.code,
    name: row.name,
    route: row.lines.join(","),
  };
}

function stationSubtitle(code: string) {
  const row = mtrStation(code);
  if (!row) return "";
  return [row.nameEn, row.lines.map((l) => MTR_LINE_NAMES[l] ?? l).join("／")]
    .filter(Boolean)
    .join(" · ");
}

export function MtrApp() {
  const [q, setQ] = useState("");
  const [actionCode, setActionCode] = useState<string | null>(null);
  const [etaCode, setEtaCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [pickingDest, setPickingDest] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);

  const [hsrOpen, setHsrOpen] = useState(false);
  const [racOpen, setRacOpen] = useState(false);
  const [racStatus, setRacStatus] = useState<RacecourseStatus | null>(null);

  const selected =
    etaCode && !isHsrStation(etaCode) && !isRacecourseStation(etaCode) ? stopFor(etaCode) : null;
  const { etas, loading, error } = useEta(selected);
  const actionStation = actionCode ? mtrStation(actionCode) : null;

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const from = sp.get("from")?.trim() ?? "";
    const to = sp.get("to")?.trim() ?? "";
    if (!from || !to || from === to) return;
    if (!mtrStation(from) || !mtrStation(to)) return;
    setOrigin(from);
    setDest(to);
    setPickingDest(false);
    setTripOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet<RacecourseStatus>("/api/mtr/racecourse")
      .then((row) => {
        if (!cancelled) setRacStatus(row);
      })
      .catch(() => {});
    const id = setInterval(() => {
      apiGet<RacecourseStatus>("/api/mtr/racecourse")
        .then((row) => {
          if (!cancelled) setRacStatus(row);
        })
        .catch(() => {});
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const matches = useMemo(() => {
    const n = q.trim();
    if (!n) return [];
    return MTR_STATIONS.filter(
      (s) =>
        s.name.includes(n) ||
        s.nameEn.toLowerCase().includes(n.toLowerCase()) ||
        s.code.toLowerCase() === n.toLowerCase(),
    ).slice(0, 8);
  }, [q]);

  function pick(code: string) {
    setQ("");
    if (pickingDest) {
      if (code === origin) return;
      setDest(code);
      setPickingDest(false);
      setTripOpen(true);
      return;
    }
    setActionCode(code);
  }

  function clearTrip() {
    setOrigin(null);
    setDest(null);
    setPickingDest(false);
    setTripOpen(false);
  }

  function startTrip(code: string) {
    setHsrOpen(false);
    setRacOpen(false);
    setOrigin(code);
    setDest(null);
    setPickingDest(true);
    setTripOpen(false);
    setActionCode(null);
    setEtaCode(null);
  }

  const searchPlaceholder = pickingDest
    ? `已選起點：${mtrStation(origin ?? "")?.name ?? ""}，搜尋或點地圖選終點`
    : "搜尋車站，或直接在路綫圖上點選";

  return (
    <div>
      <MtrSchematicMap
        selectedCode={actionCode ?? etaCode ?? dest ?? origin ?? undefined}
        originCode={origin ?? undefined}
        destCode={dest ?? undefined}
        pickHint={
          pickingDest && origin
            ? `已選起點：${mtrStation(origin)?.name}，請再點終點`
            : origin && dest && !tripOpen
              ? `${mtrStation(origin)?.name} → ${mtrStation(dest)?.name}`
              : null
        }
        pickHintAction={
          origin && dest && !tripOpen
            ? { label: "車程", onClick: () => setTripOpen(true) }
            : undefined
        }
        cancelLabel={origin && dest && !tripOpen ? "清除" : undefined}
        closedCodes={racStatus && !racStatus.open ? ["RAC"] : []}
        onSelect={pick}
        onCancelPick={
          pickingDest
            ? clearTrip
            : origin && dest && !tripOpen
              ? clearTrip
              : undefined
        }
        topOverlay={
          <div className="space-y-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-line/80 bg-elev/90 px-4 py-3 text-ink shadow-lg outline-none backdrop-blur-md focus:border-teal md:border-line md:bg-card md:shadow-none"
            />
            {matches.length ? (
              <div className="rounded-xl border border-line bg-elev/95 p-2 shadow-lg backdrop-blur-md max-h-48 overflow-y-auto md:bg-card md:shadow-none">
                {matches.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => pick(s.code)}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5"
                  >
                    {s.name}
                    <span className="text-xs text-muted ml-2">
                      {s.lines.map((l) => MTR_LINE_NAMES[l] ?? l).join("／")}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        }
      />
      {actionStation ? (
        <StationActionDialog
          title={actionStation.name}
          subtitle={
            isHsrStation(actionStation.code)
              ? "Hong Kong West Kowloon · 高速鐵路"
              : isRacecourseStation(actionStation.code)
                ? `Racecourse · 東鐵線${racStatus && !racStatus.open ? " · 未開放" : racStatus?.open ? " · 賽馬日開放中" : ""}`
                : stationSubtitle(actionStation.code)
          }
          infoHint={
            isHsrStation(actionStation.code)
              ? "查看往內地高鐵班次與車費"
              : isRacecourseStation(actionStation.code)
                ? "查看馬場站開放時間與行車分叉"
                : undefined
          }
          tripHint={
            isHsrStation(actionStation.code)
              ? "由柯士甸或九龍步行接駁港鐵"
              : isRacecourseStation(actionStation.code)
                ? "非賽馬日請改經火炭"
                : undefined
          }
          onInfo={() => {
            if (isHsrStation(actionStation.code)) setHsrOpen(true);
            else if (isRacecourseStation(actionStation.code)) setRacOpen(true);
            else setEtaCode(actionStation.code);
            setActionCode(null);
          }}
          onTrip={() => startTrip(actionStation.code)}
          onClose={() => setActionCode(null)}
        />
      ) : null}
      {hsrOpen ? <HsrDialog onClose={() => setHsrOpen(false)} /> : null}
      {racOpen ? (
        <RacecourseDialog status={racStatus} onClose={() => setRacOpen(false)} />
      ) : null}
      {selected ? (
        <EtaDialog
          title={selected.name}
          subtitle={mtrStation(selected.stopId)?.nameEn}
          etas={etas}
          loading={loading}
          error={error}
          onClose={() => setEtaCode(null)}
        />
      ) : null}
      {origin && dest && tripOpen ? (
        <MtrTripDialog
          from={origin}
          to={dest}
          onSwap={() => {
            setOrigin(dest);
            setDest(origin);
          }}
          onClose={() => setTripOpen(false)}
        />
      ) : null}
    </div>
  );
}
