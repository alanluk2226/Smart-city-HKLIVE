import { cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";

export type WeatherSnapshot = {
  temperature: number | null;
  humidity: number | null;
  place: string;
  icon: number | null;
  iconUrl: string | null;
  rainfall: { place: string; max: number }[];
  warningMessage: string;
  tropicalMessage: string;
  updateTime: string | null;
  forecast: string;
  outlook: string;
  nineDay: Array<{
    date: string;
    week: string;
    forecastWeather: string;
    forecastMaxtemp: number;
    forecastMintemp: number;
    PSR: string;
  }>;
  warnings: Array<{ name: string; type: string; action: string }>;
};

type Rhr = {
  temperature?: { data: Array<{ place: string; value: number }> };
  humidity?: { data: Array<{ place: string; value: number }> };
  rainfall?: { data: Array<{ place: string; max: number }> };
  warningMessage?: string | string[];
  tcmessage?: string | string[];
  icon?: number[];
  updateTime?: string;
};

type Flw = {
  forecastDesc?: string;
  outlook?: string;
};

type Fnd = {
  weatherForecast?: Array<{
    forecastDate: string;
    week: string;
    forecastWeather: string;
    forecastMaxtemp: { value: number };
    forecastMintemp: { value: number };
    PSR: string;
  }>;
};

type WarnSum = Record<string, { name?: string; type?: string; actionCode?: string }>;

function asText(value: string | string[] | undefined) {
  if (!value) return "";
  return Array.isArray(value) ? value.join("\n") : value;
}

export async function getWeather(): Promise<WeatherSnapshot> {
  return cached("weather:all", TTL.weather, async () => {
    const [rhr, flw, fnd, warn] = await Promise.all([
      fetchJson<Rhr>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc"),
      fetchJson<Flw>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw&lang=tc"),
      fetchJson<Fnd>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc"),
      fetchJson<WarnSum>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc"),
    ]);
    const hkoTemp = rhr.temperature?.data.find((d) => d.place === "香港天文台") ?? rhr.temperature?.data[0];
    const humidity = rhr.humidity?.data[0];
    const icon = rhr.icon?.[0] ?? null;
    const warnings = Object.values(warn ?? {})
      .filter((w) => w?.name)
      .map((w) => ({
        name: w.name ?? "",
        type: w.type ?? "",
        action: w.actionCode ?? "",
      }));
    return {
      temperature: hkoTemp?.value ?? null,
      humidity: humidity?.value ?? null,
      place: hkoTemp?.place ?? "香港天文台",
      icon,
      iconUrl: icon
        ? `https://www.hko.gov.hk/images/HKOWxIconOutline/pic${icon}.png`
        : null,
      rainfall: (rhr.rainfall?.data ?? [])
        .filter((d) => d.max > 0)
        .map((d) => ({ place: d.place, max: d.max })),
      warningMessage: asText(rhr.warningMessage),
      tropicalMessage: asText(rhr.tcmessage),
      updateTime: rhr.updateTime ?? null,
      forecast: flw.forecastDesc ?? "",
      outlook: flw.outlook ?? "",
      nineDay: (fnd.weatherForecast ?? []).map((d) => ({
        date: d.forecastDate,
        week: d.week,
        forecastWeather: d.forecastWeather,
        forecastMaxtemp: d.forecastMaxtemp.value,
        forecastMintemp: d.forecastMintemp.value,
        PSR: d.PSR,
      })),
      warnings,
    };
  });
}
