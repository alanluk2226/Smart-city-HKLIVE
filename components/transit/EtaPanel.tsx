"use client";

import { GmbEtaExtras, GmbRoutePlate } from "@/components/transit/GmbBadges";
import type { EtaResult } from "@/lib/types";

export function EtaPanel({
  title,
  etas,
  loading,
  emptyHint,
  framed = true,
}: {
  title: string;
  etas: EtaResult[];
  loading: boolean;
  emptyHint: string;
  framed?: boolean;
}) {
  return (
    <section className={framed ? "rounded-2xl border border-line bg-card p-4 min-h-72" : ""}>
      {title ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg">{title}</h2>
          {loading ? <span className="text-xs text-muted">更新中</span> : null}
        </div>
      ) : null}
      {etas.length === 0 && !loading ? (
        <p className={`text-muted ${framed ? "mt-6" : "mt-2"}`}>{emptyHint}</p>
      ) : etas.length === 0 ? (
        <p className={`text-muted ${framed ? "mt-6" : "mt-2"}`}>載入班次中…</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {etas.map((eta, i) => {
            const soonest = i === 0;
            const gmb = eta.operator === "gmb";
            return (
              <li
                key={`${eta.operator}-${eta.route}-${eta.dest}-${eta.platform}-${eta.etaTime}-${i}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-3 ${
                  soonest
                    ? gmb
                      ? "border-lime/70 bg-lime/10"
                      : "border-teal/60 bg-teal/10"
                    : "border-line"
                }`}
              >
                <div>
                  {gmb ? (
                    <GmbRoutePlate route={eta.route} region={eta.region} size="sm" />
                  ) : (
                    <div className="font-mono text-teal">{eta.route}</div>
                  )}
                  <div className="text-sm">往 {eta.dest}</div>
                  {eta.remark ? <div className="text-xs text-amber mt-1">{eta.remark}</div> : null}
                  {eta.platform ? <div className="text-xs text-muted">月台 {eta.platform}</div> : null}
                  <GmbEtaExtras eta={eta} />
                </div>
                <div className="text-right">
                  {soonest ? (
                    <div className={`mb-0.5 text-[10px] tracking-wide ${gmb ? "text-lime" : "text-teal"}`}>
                      最快
                    </div>
                  ) : null}
                  <div
                    className={`font-mono text-3xl leading-none ${
                      soonest ? (gmb ? "text-lime" : "text-teal") : ""
                    }`}
                  >
                    {eta.etaMinutes ?? "—"}
                  </div>
                  <div className="text-xs text-muted">
                    分鐘{eta.etaTime ? ` · ${eta.etaTime}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
