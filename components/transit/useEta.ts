"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import type { EtaResult, StopHit } from "@/lib/types";

export function useEta(selected: StopHit | null) {
  const [etas, setEtas] = useState<EtaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) {
      setEtas([]);
      return;
    }
    const stop = selected;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        if (stop.operator === "mtr") {
          const lines = (stop.route ?? "").split(",").filter(Boolean);
          const batches = await Promise.all(
            lines.map((line) =>
              apiGet<EtaResult[]>(
                `/api/eta?operator=mtr&line=${line}&sta=${stop.stopId}&stopName=${encodeURIComponent(stop.name)}`,
              ),
            ),
          );
          if (!cancelled) setEtas(batches.flat());
          return;
        }
        if (stop.operator === "lrt") {
          const rows = await apiGet<EtaResult[]>(
            `/api/eta?operator=lrt&stopId=${stop.stopId}&stopName=${encodeURIComponent(stop.name)}`,
          );
          if (!cancelled) setEtas(rows);
          return;
        }
        if (stop.operator === "nlb") {
          const params = new URLSearchParams({
            operator: "nlb",
            stopId: stop.stopId,
            stopName: stop.name,
            allRoutes: "1",
          });
          if (stop.routeIds?.length) params.set("routeIds", stop.routeIds.join(","));
          if (stop.routeId) params.set("routeId", stop.routeId);
          const rows = await apiGet<EtaResult[]>(`/api/eta?${params}`);
          if (!cancelled) setEtas(rows);
          return;
        }
        const params = new URLSearchParams({
          operator: stop.operator,
          stopId: stop.stopId,
          stopName: stop.name,
        });
        if (stop.route) params.set("route", stop.route);
        if (stop.routeId) params.set("routeId", stop.routeId);
        if (stop.bound) params.set("bound", stop.bound);
        if (stop.serviceType) params.set("serviceType", stop.serviceType);
        if (stop.seq != null) params.set("seq", String(stop.seq));
        const rows = await apiGet<EtaResult[]>(`/api/eta?${params}`);
        const route = stop.route?.trim().toUpperCase();
        const filtered = route ? rows.filter((row) => row.route.toUpperCase() === route) : rows;
        if (!cancelled) setEtas(filtered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "無法載入到達時間");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(() => load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    selected?.operator,
    selected?.stopId,
    selected?.route,
    selected?.routeId,
    selected?.routeIds,
    selected?.bound,
    selected?.serviceType,
    selected?.seq,
    selected?.name,
  ]);

  return { etas, loading, error };
}
