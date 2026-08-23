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
        const params = new URLSearchParams({
          operator: stop.operator,
          stopId: stop.stopId,
          stopName: stop.name,
        });
        if (stop.route) params.set("route", stop.route);
        if (stop.routeId) params.set("routeId", stop.routeId);
        const rows = await apiGet<EtaResult[]>(`/api/eta?${params}`);
        if (!cancelled) setEtas(rows);
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
  }, [selected?.operator, selected?.stopId, selected?.route, selected?.routeId, selected?.name]);

  return { etas, loading, error };
}
