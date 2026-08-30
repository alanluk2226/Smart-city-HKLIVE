"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, openWalkingDirections, useGeo, waitTone } from "@/lib/client";
import { DEFAULT_CENTER, parseWaitMinutes } from "@/lib/geo";
import type { HospitalWait } from "@/lib/providers/hospitals";
import type { SopClusterSnapshot, SopSpecialtyWait } from "@/lib/providers/sop";

type SortMode = "nearest" | "wait";

function compactWaitLabel(text: string, minutes: number | null) {
  if (minutes == null) {
    if (/搶救/.test(text)) return "搶救中";
    return text.replace(/\s+/g, "") || "—";
  }
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

/** Same thresholds as waitTone / list meters: ≤1h · ≤3h · >3h */
function waitBadgeLevel(minutes: number | null): "good" | "warn" | "bad" | "unknown" {
  if (minutes == null) return "unknown";
  if (minutes <= 60) return "good";
  if (minutes <= 180) return "warn";
  return "bad";
}

function parseWeeks(text: string): number | null {
  if (!text || text === "—") return null;
  if (text.includes("少於") && text.includes("星期")) return 0.5;
  const m = text.match(/([\d.]+)\s*星期/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function TriageMeter({
  label,
  value,
  minutes,
  scaleMax,
  kind,
  note,
}: {
  label: string;
  value: string;
  minutes: number | null;
  scaleMax: number;
  kind: "citizen" | "urgent" | "critical";
  note?: string;
}) {
  const pct =
    minutes == null
      ? kind === "critical"
        ? 8
        : 12
      : Math.min(100, Math.max(6, (minutes / scaleMax) * 100));

  const barCls =
    kind === "critical"
      ? "bg-line"
      : kind === "citizen"
        ? minutes == null
          ? "bg-teal/50"
          : minutes <= 60
            ? "bg-teal"
            : minutes <= 180
              ? "bg-amber"
              : "bg-rose"
        : minutes == null
          ? "bg-amber/40"
          : minutes <= 30
            ? "bg-amber/60"
            : minutes <= 90
              ? "bg-amber"
              : "bg-rose";

  const shellCls =
    kind === "citizen"
      ? "border-teal/40 bg-teal/10"
      : kind === "urgent"
        ? "border-line bg-elev/50"
        : "border-line/80 bg-elev/30";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${shellCls}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm ${kind === "citizen" ? "font-medium text-ink" : "text-muted"}`}>
            {label}
          </p>
          {note ? <p className="mt-0.5 text-[10px] text-muted">{note}</p> : null}
        </div>
        <span
          className={`shrink-0 font-mono text-base ${
            kind === "citizen" ? waitTone(minutes) : "text-ink"
          }`}
        >
          {value}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/70">
        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SopTable({ sop }: { sop: SopClusterSnapshot }) {
  const maxStable = useMemo(() => {
    const weeks = sop.specialties.map((s) => parseWeeks(s.stableLong) ?? 0);
    return Math.max(1, ...weeks);
  }, [sop.specialties]);

  return (
    <>
      <p className="text-[11px] text-muted">
        {sop.cluster}
        {sop.periodFrom && sop.periodTo ? ` · 報告期 ${sop.periodFrom} 至 ${sop.periodTo}` : ""}
        {sop.nextUpdate ? ` · 下次更新 ${sop.nextUpdate}` : ""}
      </p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead className="bg-elev/90 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">專科</th>
              <th className="px-3 py-2 font-medium">緊急</th>
              <th className="px-3 py-2 font-medium">半緊急</th>
              <th className="px-3 py-2 font-medium">穩定（中位）</th>
              <th className="min-w-[9rem] px-3 py-2 font-medium">穩定（最長）</th>
            </tr>
          </thead>
          <tbody>
            {sop.specialties.map((s, i) => (
              <SopRow key={s.specialty} row={s} maxStable={maxStable} zebra={i % 2 === 1} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SopRow({
  row,
  maxStable,
  zebra,
}: {
  row: SopSpecialtyWait;
  maxStable: number;
  zebra: boolean;
}) {
  const weeks = parseWeeks(row.stableLong);
  const pct = weeks == null ? 0 : Math.min(100, (weeks / maxStable) * 100);
  const hot = weeks != null && weeks >= maxStable * 0.75;
  return (
    <tr className={`border-t border-line ${zebra ? "bg-elev/35" : "bg-card/40"}`}>
      <td className="px-3 py-2 text-ink">{row.specialty}</td>
      <td className="px-3 py-2 font-mono text-muted">{row.urgentMedian}</td>
      <td className="px-3 py-2 font-mono text-muted">{row.semiUrgentMedian}</td>
      <td className="px-3 py-2 font-mono text-ink">{row.stableMedian}</td>
      <td className="px-3 py-2">
        <div className="relative overflow-hidden rounded-md bg-line/40 px-2 py-1">
          <div
            className={`absolute inset-y-0 left-0 ${hot ? "bg-rose/35" : "bg-amber/25"}`}
            style={{ width: `${pct}%` }}
          />
          <span className={`relative font-mono ${hot ? "text-rose" : "text-ink"}`}>
            {row.stableLong}
          </span>
        </div>
      </td>
    </tr>
  );
}

function HospitalDetail({
  hospital,
  hasLocated,
  sop,
  sopLoading,
  sopError,
  onClose,
}: {
  hospital: HospitalWait;
  hasLocated: boolean;
  sop: SopClusterSnapshot | null;
  sopLoading: boolean;
  sopError: string;
  onClose: () => void;
}) {
  const t45m = parseWaitMinutes(hospital.t45);
  const t3m = parseWaitMinutes(hospital.t3);
  const t2m = parseWaitMinutes(hospital.t2);
  const t1m = parseWaitMinutes(hospital.t1);
  const scaleMax = Math.max(120, t45m ?? 0, t3m ?? 0, 60);

  return (
    <section
      className="rounded-2xl border border-teal/40 bg-card p-4 shadow-[0_8px_28px_rgba(0,0,0,.2)]"
      aria-label={`${hospital.name}詳情`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl leading-snug text-ink">{hospital.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {hospital.cluster}醫院聯網
            {hasLocated && hospital.distanceMeters != null
              ? ` · ${formatDistance(hospital.distanceMeters)}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
        >
          關閉
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openWalkingDirections(hospital.lat, hospital.lng, hospital.name)}
          className="inline-flex items-center gap-1.5 rounded-full bg-teal px-3.5 py-2 text-xs font-medium text-bg hover:opacity-90"
        >
          前往醫院
        </button>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${hospital.lat},${hospital.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-line px-3.5 py-2 text-xs text-muted hover:text-ink"
        >
          外部地圖
        </a>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-medium text-ink">急症室輪候</h3>
          <span className="inline-flex items-center gap-1 text-[11px] text-teal">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal/50 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
            </span>
            約每 15 分鐘更新
          </span>
        </div>
        <p className="text-[11px] text-muted">危殆／危急請打 999；一般市民多屬半緊急／非緊急。</p>
        <div className="space-y-1.5">
          <TriageMeter
            label="半緊急／非緊急"
            value={hospital.t45}
            minutes={t45m}
            scaleMax={scaleMax}
            kind="citizen"
            note="市民最常對應嘅分流"
          />
          <TriageMeter
            label="緊急"
            value={hospital.t3}
            minutes={t3m}
            scaleMax={scaleMax}
            kind="urgent"
          />
          <TriageMeter
            label="危急"
            value={hospital.t2}
            minutes={t2m}
            scaleMax={scaleMax}
            kind="critical"
            note="通常即時處理"
          />
          <TriageMeter
            label="危殆"
            value={hospital.t1}
            minutes={t1m}
            scaleMax={scaleMax}
            kind="critical"
            note="通常即時處理"
          />
        </div>
        {hospital.updateTime ? (
          <p className="text-[11px] text-muted">醫管局更新：{hospital.updateTime}</p>
        ) : null}
      </div>

      <div className="mt-5 space-y-2">
        <h3 className="text-sm font-medium text-ink">專科門診新症輪候</h3>
        <p className="flex gap-1.5 text-[11px] leading-snug text-muted">
          <span className="mt-0.5 shrink-0" aria-hidden>
            ℹ️
          </span>
          <span>
            官方無即日門診／急症「排號進度」開放數據。下表係所屬聯網專科門診
            <strong className="font-medium text-ink">新症預約</strong>
            輪候（以星期計、每季更新），唔係即日票號。橫條愈長＝穩定新症最長輪候愈耐。
          </span>
        </p>
        {sopLoading ? <p className="text-sm text-muted">載入專科門診資料…</p> : null}
        {sopError ? <p className="text-sm text-rose">{sopError}</p> : null}
        {sop ? <SopTable sop={sop} /> : null}
      </div>
    </section>
  );
}

export function HealthApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [hasLocated, setHasLocated] = useState(false);
  const [sort, setSort] = useState<SortMode>("wait");
  const [rows, setRows] = useState<HospitalWait[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sop, setSop] = useState<SopClusterSnapshot | null>(null);
  const [sopLoading, setSopLoading] = useState(false);
  const [sopError, setSopError] = useState("");
  const locatedOnce = useRef(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const applyLocation = (lat: number, lng: number) => {
    setCenter({ lat, lng });
    setHasLocated(true);
    setSort("nearest");
  };

  const locate = useGeo(applyLocation);

  useEffect(() => {
    if (locatedOnce.current || !navigator.geolocation) return;
    locatedOnce.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120_000 },
    );
  }, []);

  useEffect(() => {
    apiGet<HospitalWait[]>(`/api/hospitals?lat=${center.lat}&lng=${center.lng}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [center]);

  const active = useMemo(
    () => (selected ? rows.find((h) => h.name === selected) ?? null : null),
    [rows, selected],
  );

  useEffect(() => {
    if (!active) {
      setSop(null);
      setSopError("");
      setSopLoading(false);
      return;
    }
    let alive = true;
    setSopLoading(true);
    setSopError("");
    apiGet<SopClusterSnapshot>(
      `/api/hospitals/sop?cluster=${encodeURIComponent(active.cluster)}`,
    )
      .then((snap) => {
        if (!alive) return;
        setSop(snap);
        setSopLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setSop(null);
        setSopError(e instanceof Error ? e.message : "無法載入專科門診資料");
        setSopLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active]);

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "nearest" && list.some((h) => h.distanceMeters != null)) {
      list.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    } else {
      list.sort((a, b) => (a.waitMinutes ?? 9999) - (b.waitMinutes ?? 9999));
    }
    return list;
  }, [rows, sort]);

  const topFastest = useMemo(() => {
    return [...rows]
      .filter((h) => h.waitMinutes != null)
      .sort((a, b) => (a.waitMinutes ?? 9999) - (b.waitMinutes ?? 9999))
      .slice(0, 3);
  }, [rows]);

  function pickHospital(name: string) {
    setSelected(name);
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <AppShell>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-snug text-muted sm:text-sm">
          地圖標籤＝半緊急／非緊急輪候。點選醫院睇詳情同導航。危急請打 999。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-full border border-line p-0.5 text-xs"
            role="group"
            aria-label="排序方式"
          >
            <button
              type="button"
              onClick={() => setSort("nearest")}
              disabled={!hasLocated}
              className={`rounded-full px-3 py-1.5 transition disabled:opacity-40 ${
                sort === "nearest" ? "bg-teal/20 text-teal" : "text-muted hover:text-ink"
              }`}
            >
              最近
            </button>
            <button
              type="button"
              onClick={() => setSort("wait")}
              className={`rounded-full px-3 py-1.5 transition ${
                sort === "wait" ? "bg-teal/20 text-teal" : "text-muted hover:text-ink"
              }`}
            >
              最短等候
            </button>
          </div>
          <button
            type="button"
            onClick={locate}
            className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs hover:border-teal sm:text-sm"
          >
            {hasLocated ? "更新位置" : "使用我的位置"}
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose">{error}</p> : null}

      <NearbyMapDynamic
        lat={center.lat}
        lng={center.lng}
        zoom={11}
        fitAllPoints
        selectedId={selected ?? undefined}
        onSelect={(p) => pickHospital(p.id)}
        heightClass="h-72 sm:h-80"
        className="max-md:-mx-4 max-md:rounded-none max-md:border-x-0 md:rounded-xl"
        points={sorted.map((h) => ({
          id: h.name,
          name: h.name,
          lat: h.lat,
          lng: h.lng,
          detail: `半緊急／非緊急 ${h.t45}`,
          badge: compactWaitLabel(h.t45, h.waitMinutes),
          badgeLevel: waitBadgeLevel(h.waitMinutes),
        }))}
      />

      {topFastest.length ? (
        <section className="mt-4 rounded-2xl border border-line bg-card p-3" aria-label="全港最短等候">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-ink">全港最短急症室 TOP 3</h2>
            <p className="text-[11px] text-muted">半緊急／非緊急</p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3">
            {topFastest.map((h, i) => (
              <li key={h.name}>
                <button
                  type="button"
                  onClick={() => pickHospital(h.name)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                    selected === h.name
                      ? "border-teal/50 bg-teal/10"
                      : "border-line bg-elev/40 hover:border-teal/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="text-[11px] text-muted">#{i + 1}</span>
                    <span className="mt-0.5 block truncate text-sm text-ink">{h.name}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-sm ${waitTone(h.waitMinutes)}`}>
                    {h.t45}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {active ? (
        <div ref={detailRef} className="mt-4">
          <HospitalDetail
            hospital={active}
            hasLocated={hasLocated}
            sop={sop}
            sopLoading={sopLoading}
            sopError={sopError}
            onClose={() => setSelected(null)}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {sorted.map((h) => {
          const on = selected === h.name;
          return (
            <article
              key={h.name}
              data-hospital={h.name}
              onClick={() => pickHospital(h.name)}
              className={`cursor-pointer rounded-2xl border bg-card p-4 transition ${
                on ? "border-teal/50 ring-1 ring-teal/40" : "border-line hover:border-teal/30"
              }`}
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg leading-snug">{h.name}</h2>
                  <div className="mt-0.5 text-xs text-muted">
                    {h.cluster}
                    {hasLocated && h.distanceMeters != null
                      ? ` · ${formatDistance(h.distanceMeters)}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-xl leading-none ${waitTone(h.waitMinutes)}`}>
                    {h.t45}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">半緊急／非緊急</div>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line/70">
                <div
                  className={`h-full rounded-full ${
                    h.waitMinutes == null
                      ? "bg-line"
                      : h.waitMinutes <= 60
                        ? "bg-teal"
                        : h.waitMinutes <= 180
                          ? "bg-amber"
                          : "bg-rose"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(8, ((h.waitMinutes ?? 0) / 360) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-teal">{on ? "詳情見上方" : "點擊睇詳情／導航"}</p>
            </article>
          );
        })}
      </div>

      {sorted[0]?.updateTime ? (
        <p className="mt-4 text-xs text-muted">醫管局急症室更新：{sorted[0].updateTime}</p>
      ) : null}
    </AppShell>
  );
}
