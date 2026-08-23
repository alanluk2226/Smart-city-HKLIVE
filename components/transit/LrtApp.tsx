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
      return;
    }
    setActionCode(code);
  }

  function startTrip(code: string) {
    setOrigin(code);
    setDest(null);
    setPickingDest(true);
    setActionCode(null);
    setEtaCode(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            pickingDest
              ? `已選起點：${lrtStation(origin ?? "")?.name ?? ""}，搜尋或點地圖選終點`
              : "搜尋輕鐵站，或直接在路綫圖上點選"
          }
          className="flex-1 rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-teal"
        />
      </div>
      {matches.length ? (
        <div className="rounded-xl border border-line bg-card p-2">
          {matches.map((s) => (
            <button
              key={s.id}
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
      <LrtSchematicMap
        selectedCode={actionCode ?? etaCode ?? dest ?? origin ?? undefined}
        originCode={origin ?? undefined}
        destCode={dest ?? undefined}
        pickHint={
          pickingDest && origin ? `已選起點：${lrtStation(origin)?.name}，請再點終點` : null
        }
        onSelect={pick}
        onCancelPick={
          pickingDest
            ? () => {
                setPickingDest(false);
                setOrigin(null);
                setDest(null);
              }
            : undefined
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
          onClose={() => setEtaCode(null)}
        />
      ) : null}
      {origin && dest ? (
        <LrtTripDialog
          from={origin}
          to={dest}
          onSwap={() => {
            setOrigin(dest);
            setDest(origin);
          }}
          onClose={() => {
            setOrigin(null);
            setDest(null);
            setPickingDest(false);
          }}
        />
      ) : null}
    </div>
  );
}
