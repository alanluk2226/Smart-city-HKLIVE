"use client";

import { useMemo, useState } from "react";
import { EtaDialog } from "@/components/transit/EtaDialog";
import { LrtSchematicMap } from "@/components/transit/LrtSchematicMap";
import { LrtTripDialog } from "@/components/transit/LrtTripDialog";
import { StationActionDialog } from "@/components/transit/StationActionDialog";
import { useEta } from "@/components/transit/useEta";
import { LRT_STATIONS, lrtStation } from "@/lib/static/lrt-stations";
import type { StopHit } from "@/lib/types";

function stopFor(id: string): StopHit | null {
  const row = lrtStation(id);
  if (!row) return null;
  return {
    operator: "lrt",
    operatorName: "輕鐵",
    stopId: String(row.id),
    name: row.name,
  };
}

export function LrtApp() {
  const [q, setQ] = useState("");
  const [actionCode, setActionCode] = useState<string | null>(null);
  const [etaCode, setEtaCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [pickingDest, setPickingDest] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);

  const selected = etaCode ? stopFor(etaCode) : null;
  const { etas, loading, error } = useEta(selected);
  const actionStation = actionCode ? lrtStation(actionCode) : null;

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return LRT_STATIONS.filter(
      (s) =>
        s.name.toLowerCase().includes(n) ||
        s.nameEn.toLowerCase().includes(n) ||
        s.code.toLowerCase() === n ||
        String(s.id) === n,
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
    setOrigin(code);
    setDest(null);
    setPickingDest(true);
    setTripOpen(false);
    setActionCode(null);
    setEtaCode(null);
  }

  const searchPlaceholder = pickingDest
    ? `已選起點：${lrtStation(origin ?? "")?.name ?? ""}，搜尋或點地圖選終點`
    : "搜尋輕鐵站，或直接在路綫圖上點選";

  return (
    <div>
      <LrtSchematicMap
        selectedCode={actionCode ?? etaCode ?? dest ?? origin ?? undefined}
        originCode={origin ?? undefined}
        destCode={dest ?? undefined}
        pickHint={
          pickingDest && origin
            ? `已選起點：${lrtStation(origin)?.name}，請再點終點`
            : origin && dest && !tripOpen
              ? `${lrtStation(origin)?.name} → ${lrtStation(dest)?.name}`
              : null
        }
        pickHintAction={
          origin && dest && !tripOpen
            ? { label: "車程", onClick: () => setTripOpen(true) }
            : undefined
        }
        cancelLabel={origin && dest && !tripOpen ? "清除" : undefined}
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
                    key={s.id}
                    type="button"
                    onClick={() => pick(String(s.id))}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5"
                  >
                    {s.name}
                    <span className="text-xs text-muted ml-2">
                      {s.zone} · {s.nameEn}
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
          subtitle={`${actionStation.nameEn} · ${actionStation.zone} · ${String(actionStation.id).padStart(3, "0")}`}
          infoHint="一次睇晒此站全部路綫到達時間"
          tripHint="規劃輕鐵車程與車費"
          onInfo={() => {
            setEtaCode(String(actionStation.id));
            setActionCode(null);
          }}
          onTrip={() => startTrip(String(actionStation.id))}
          onClose={() => setActionCode(null)}
        />
      ) : null}
      {selected ? (
        <EtaDialog
          title={selected.name}
          subtitle={lrtStation(selected.stopId)?.nameEn}
          etas={etas}
          loading={loading}
          error={error}
          showAllRoutes
          fareHint="視起迄站而定 · 可用「起點／終點」查閱八達通車費"
          onClose={() => setEtaCode(null)}
        />
      ) : null}
      {origin && dest && tripOpen ? (
        <LrtTripDialog
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
