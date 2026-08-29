"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import type { RouteInfo } from "@/lib/types";
import type { RouteHit, StopHit } from "@/lib/types";

export function useRouteInfo(route: RouteHit | null, stop: StopHit | null, stopCount?: number) {
  const [info, setInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!route || !stop) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      operator: route.operator,
      route: route.route,
    });
    if (route.bound) params.set("bound", route.bound);
    if (route.dest) params.set("dest", route.dest);
    if (route.serviceType) params.set("serviceType", route.serviceType);
    if (route.routeId) params.set("routeId", route.routeId);
    if (stop.seq != null) params.set("seq", String(stop.seq));
    if (stopCount != null) params.set("stopCount", String(stopCount));

    apiGet<RouteInfo>(`/api/route-info?${params}`)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    route?.operator,
    route?.route,
    route?.bound,
    route?.dest,
    route?.serviceType,
    route?.routeId,
    stop?.seq,
    stop?.stopId,
    stopCount,
  ]);

  return { info, loading };
}
