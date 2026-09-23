# HK City Live (香港城市實況)

A Hong Kong city dashboard built on open government and operator data: live transit ETAs, weather and alerts, hospital A&E waits, Transport Department CCTV, carpark vacancy, and LCSD facilities.

**Live:** [https://hk-city-live.vercel.app/](https://hk-city-live.vercel.app/)

All browser traffic goes through **Next.js Route Handlers** so operators’ APIs are not called from the client (CORS, keys, and rate limits stay on the server).

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy [`.env.example`](./.env.example) to `.env.local` and fill in optional keys (see [Environment](#environment)).

---

## Tech stack

| Layer | Choice |
|--------|--------|
| App | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| UI | **Tailwind CSS 4**; **light / dark** theme (`data-theme`, Settings + `localStorage`) |
| Maps | **Leaflet** + **react-leaflet**; optional **Google Maps** tiles via `leaflet.googlemutant` / JS API loader; **OpenStreetMap** fallback |
| Road geometry | **OSRM** (self-hosted or public demo) — stop sequences → polylines (operators do not publish shapes) |
| AI assistant | **Google Gemini** (`generativelanguage.googleapis.com`) |
| Analytics | Vercel Analytics + Speed Insights |
| Deploy | **Vercel** at [hk-city-live.vercel.app](https://hk-city-live.vercel.app/), region **`hnd1` (Tokyo)** — see [`vercel.json`](./vercel.json) |
| Optional Redis | **Upstash Redis** (Vercel KV REST) — corridor polylines + quota counters; app works without it |

---

## Implementation patterns (worth knowing)

These are real behaviours in the codebase — not a buzzword list.

| Pattern | Where / why |
|---------|-------------|
| **Light / dark mode** | `lib/theme.ts` + `ThemeProvider`; preference in `localStorage` (`hk-live-theme`); boot script on `<html data-theme>` avoids flash. Toggle in **Settings**. |
| **Server proxy APIs** | Every operator / gov call goes through `/api/*` so the browser never hits CORS-blocked endpoints. |
| **Multi-layer cache** | In-memory TTL (`lib/cache.ts`) → Next.js `unstable_cache` → optional **Upstash/Vercel KV** for long-lived bus/tram **road corridors** and map/AI quota counters. Live ETA stays short-TTL. |
| **Search** | `/api/search` fans out across KMB / Citybus / NLB / GMB / MTR Bus (+ static MTR stations) and returns normalized route/station hits. |
| **Nearby** | `/api/nearby` phases (`fast` → `gmb` → `all`) so the map can show quick results before slower catalogs finish. |
| **Lazy / dynamic maps** | Leaflet map bundles load via `next/dynamic` (`*MapDynamic.tsx`) so the main shell stays light until a map is needed. |
| **Circuit breakers** | Google Maps monthly free-load budget and Gemini daily RPD can pause those features and fall back (OSM / local trip advice). |

### Upstash / Vercel KV (the “database” on the dashboard)

The Storage entry you see in Vercel (e.g. Upstash Redis / KV) is **not** a primary application database. There is no user account table.

It is an **optional Redis-over-HTTP cache** (`lib/kv.ts`), typically wired with:

- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV naming), or  
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

**Used for:**

1. Caching computed **OSRM corridor polylines** so the second visitor of the same bus/tram route gets an instant map line (~30 day TTL).  
2. Shared **quota / rate-limit counters** (e.g. Maps monthly loads, AI daily budget) across serverless instances.

If KV env vars are missing, the app still runs: corridors recompute via OSRM + Next cache; quotas fall back to in-process memory (less accurate across instances).

Pull env from Vercel locally (after `vercel link`):

```bash
vercel env pull .env.development.local
```

You do **not** need `@upstash/redis` for this project — the code talks to the REST API with `fetch`.

---

## Product modules (pages)

| Path | What it shows |
|------|----------------|
| `/` | Dashboard hub |
| `/transit` | Transit overview |
| `/transit/bus` | KMB / LWB, Citybus (+ NLB / MTR Bus via search) |
| `/transit/minibus` | Green minibuses (GMB) |
| `/transit/lrt` | Light Rail |
| `/transit/mtr` | MTR live ETA on the **official** system map |
| `/transit/tram` | Tram (static line + headway-style ETA) |
| `/transit/ferry` | Ferry hubs / ETA |
| `/transit/taxi` | Taxi-related open data |
| `/weather` | HKO current conditions, warnings, 9-day forecast, radar/wind |
| `/health` | HA A&E waiting times (+ SOP) |
| `/traffic` | TD road CCTV by region |
| `/parking` | Carpark vacancy |
| `/facilities` | LCSD venues + public toilets |
| `/favorites` | Saved stops / routes |
| `/settings` | Theme, preferences, credits |

Dashboard chrome also surfaces **HKO warnings / special weather tips** and **TD special traffic news** (accidents, road closures, etc.).

---

## Open data & upstream APIs

Sources are called **only from the server** (`lib/providers/*`). Names below are the organisations / feeds this app uses — URLs can change; the providers are the source of truth.

### City services (hospitals, weather, traffic, venues, toilets, parking)

| Module | Provider(s) | What we use |
|--------|-------------|-------------|
| **Weather** `/weather` | Hong Kong Observatory (HKO) open weather API; AQHI from data.gov.hk dashboard | Current conditions (`rhrread`), forecast (`flw` / `fnd`), warning summary (`warnsum`), special weather tips; radar & wind animation JSON/images |
| **Alerts strip** | HKO + Transport Department (TD) | Warnings / SWT + TD special traffic news XML |
| **Hospitals** `/health` | Hospital Authority (HA) open data | A&E waiting times; SOP waiting times |
| **Traffic CCTV** `/traffic` | TD / data.gov.hk | Camera location XML + snapshot JPEGs (`tdcctv.data.one.gov.hk`) |
| **Parking** `/parking` | data.gov.hk carpark API | Carpark info + live vacancy |
| **Facilities** `/facilities` | Leisure and Cultural Services Department (LCSD) | Venue JSON (sports centres, courts, pools, beaches, …) |
| **Toilets** `/facilities` | CSDI / FEHD FeatureServer | Public toilet locations |
| **Taxi** `/transit/taxi` | TD CSV + CSDI FeatureServer | Call stations / related places |

### Transit operators & transport open data

| Domain | Upstream |
|--------|----------|
| **KMB / LWB** | `data.etabus.gov.hk` (routes, stops, ETA) |
| **Citybus** | `rt.data.gov.hk` Citybus v2 |
| **NLB** | `rt.data.gov.hk` NLB v2 |
| **GMB** | `data.etagmb.gov.hk` |
| **MTR / LRT ETA** | `rt.data.gov.hk` MTR schedule & LRT schedule |
| **MTR Bus** | MTR opendata CSVs + `rt.data.gov.hk` MTR bus schedule |
| **MTR fares / lines** | `opendata.mtr.com.hk` CSVs (lines, fares, AEL, light rail fares, bus routes/stops) |
| **HSR** | `highspeed.mtr.com.hk` timetable / trip-planning JSON |
| **Ferry** | Sun Ferry ETA + HKKF open ETA (+ static hub data in-repo) |
| **Tram** | In-repo static line / headway (no live operator ETA API) |
| **Route fares (extra)** | hkbus crawl JSON; TD `ROUTE_BUS.xml` / `ROUTE_GMB.xml` |
| **Racecourse days** | HKJC racing fixture page (for Racecourse station service) |

### Non-government helpers

| Service | Role |
|---------|------|
| **OSRM** | Walk / drive polylines for map corridors |
| **Google Maps JS** (optional) | Map tiles when key + quota allow |
| **OpenStreetMap** | Default / fallback tiles |
| **Gemini** | Dashboard trip assistant |

Data remains under each publisher’s open-data / terms of use. This app aggregates and displays it; it is not an official government service.

---

## Architecture (high level)

```
Browser UI  →  /api/* (Next.js)  →  Operator / gov open APIs
                    ↓
              lib/providers/*   (fetch, normalize, cache)
                    ↓
              Optional: OSRM, Gemini, KV
```

- **Providers** under `lib/providers/` own each domain (KMB, Citybus, MTR, weather, alerts, AI, …).
- **Static topology** (MTR graph, schematic coords, station lists) lives under `lib/static/`.
- **Short TTL** caches for live ETA; **longer** caches for catalogs, weather snapshots, and road corridors.

---

## Core logic

### Transit & ETA

1. UI asks `/api/eta`, `/api/search`, `/api/nearby`, `/api/stops` with an operator / route / stop id.
2. The route handler dispatches to the matching provider (KMB etabus, Citybus, NLB, GMB etagmb, `rt.data.gov.hk` for MTR/LRT, MTR Bus, etc.).
3. Responses are normalized for the UI. Live ETA is cached briefly (~20s).

**Map corridors:** stop order alone is not a road path. `POST /api/route/drive` runs stop sequences through OSRM driving (with walk via `/api/route/walk`). Results are stored in memory → optional KV (≈30 days) → Next.js data cache so the second viewer of the same route gets an instant polyline.

### City alerts strip

`GET /api/alerts` merges:

- HKO warning summary / special weather tips  
- TD special traffic news (XML)  
- MTR service delay signals  

Used on the dashboard and as **context for the AI assistant** (preference only — not fake live minute counts).

### AI trip assistant

Endpoint: `POST /api/ai/trip` (pinned to **`hnd1`**).

| Piece | Role |
|--------|------|
| **Gemini** | Owns free-form A→B advice in Cantonese written Chinese. Must offer at least an **MTR** plan and a **bus/minibus** plan; optional third option if clearly faster/more convenient. |
| **Dashboard context** | Live weather + alert headlines steer *which option to recommend first* (e.g. rain → prefer MTR). |
| **`adviseTrip` (local)** | Deterministic options from MTR graph, direct-bus scan, walk/OSRM heuristics — passed as a **soft grounded hint**, not a hard allow-list. |
| **Fallback** | If Gemini is paused / missing key, UI can still show locally computed options when the from/to pair resolves. |

**Quotas:** per-IP free questions (20 / Hong Kong calendar day) + burst limit; project-wide Gemini daily budget (`GEMINI_DAILY_BUDGET`, default `250` RPD estimate) trips a pause near 98% until HK midnight.

### Maps: Google vs OSM

- With `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, maps can use Google tiles.  
- Without a key, or when the **monthly free Dynamic Maps budget** is nearly used (default 10 000 loads, trip at 98%), the app switches to **OSM** until the Pacific-time month resets.  
- Local `next dev` defaults to OSM unless `NEXT_PUBLIC_USE_GOOGLE_MAPS=1`.  
- Client + `/api/maps/quota` track usage (app counters, not Google Cloud Console).

### MTR map assets

| Asset | Use |
|--------|-----|
| [`public/mtr-system-map.svg`](./public/mtr-system-map.svg) | **Product UI** — official system map; click targets in `lib/static/mtr-map-hits.ts` |
| [`public/mtr-schematic-own.svg`](./public/mtr-schematic-own.svg) | **Portfolio / personal** — original blocky schematic (generated by `scripts/gen-mtr-schematic-svg.ts`). Not the in-app map. |

Regenerate the portfolio schematic (optional):

```bash
npx tsx scripts/gen-mtr-schematic-svg.ts
```

---

## HTTP API (server)

All under `/api/*`. Important handlers:

| Route | Purpose | Typical upstream |
|-------|---------|------------------|
| `GET /api/eta` | Live arrivals | KMB, Citybus, NLB, GMB, MTR/LRT, MTR Bus, tram (local) |
| `GET /api/search` | Route / station search | Bus + GMB + MTR Bus + static MTR |
| `GET /api/nearby` | Stops near lat/lng | Same + LRT / static MTR (`phase=fast\|gmb\|all`) |
| `GET /api/stops` | Stops on a route | Operator stop catalogs |
| `GET /api/route-info` | Fare / journey meta | hkbus crawl JSON, TD ROUTE XML |
| `GET /api/gmb/routes` | GMB index by region | data.etagmb.gov.hk |
| `GET /api/mtr/trip` | MTR A→B plan | MTR open CSVs + local graph |
| `GET /api/lrt/trip` | LRT A→B | LRT graph + fares |
| `GET /api/mtr/hsr` | High-speed rail | highspeed.mtr.com.hk |
| `GET /api/mtr/racecourse` | Racecourse service days | HKJC fixtures |
| `GET /api/tram` | Tram catalog / ETA | Static line data |
| `GET /api/ferry` | Ferry hubs / ETA | Sun Ferry, HKKF + static |
| `GET /api/taxi` | Taxi-related places | TD / CSDI |
| `GET /api/weather` | Weather snapshot | HKO + AQHI |
| `GET /api/weather/maps` | Radar / wind metadata | HKO |
| `GET /api/weather/maps/image` | Image proxy | HKO |
| `GET /api/alerts` | Dashboard alerts | HKO + TD XML + MTR |
| `GET /api/hospitals` | A&E waits | ha.org.hk |
| `GET /api/hospitals/sop` | SOP waits | ha.org.hk |
| `GET /api/traffic` | CCTV camera list | TD XML |
| `GET /api/traffic/image` | CCTV JPEG proxy | tdcctv.data.one.gov.hk |
| `GET /api/parking` | Carpark vacancy | api.data.gov.hk |
| `GET /api/facilities` | LCSD facilities | lcsd.gov.hk |
| `GET /api/toilets` | Public toilets | CSDI FEHD |
| `GET /api/route/walk` | Walk polyline | OSRM foot |
| `POST /api/route/drive` | Corridor polyline | OSRM driving + KV/cache |
| `POST /api/ai/trip` | Multi-turn trip assistant | Gemini + local trip helpers |
| `GET\|POST /api/maps/quota` | Google Maps load circuit | App counters |
| `GET /api/version` | Deploy / build id | Env / Vercel |

---

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | No | Maps JavaScript API |
| `NEXT_PUBLIC_USE_GOOGLE_MAPS` | No | Set `1` in local dev to force Google tiles |
| `GOOGLE_MAPS_MONTHLY_BUDGET` | No | Free Dynamic Maps loads (default `10000`) |
| `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | No* | Dashboard AI (*recommended for full assistant) |
| `GEMINI_DAILY_BUDGET` | No | Estimated free RPD (default `250`) |
| `OSRM_BASE_URL` | No | Self-hosted OSRM; else public demo |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | No | Vercel KV for corridor cache |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | No | Upstash alternative |
| `NEXT_PUBLIC_APP_BUILD_ID` | No | Client build stamp (also derived from Vercel) |

**Deploy note:** Gemini may reject the Hong Kong region (`hkg1`). This project pins Functions to **Tokyo `hnd1`**. US east tends to add latency to Hong Kong bus APIs.

---

## Project layout (selected)

```
app/                 # App Router pages + api/*
components/          # UI (transit, weather, maps, AI, shell)
lib/providers/       # Upstream adapters + AI
lib/static/          # MTR/LRT/tram topology, hits, names
lib/cache.ts         # Shared TTL / Next cache helpers
lib/road-corridor.ts # OSRM corridor + KV layers
public/              # Static assets (official MTR map, etc.)
scripts/             # Generators (e.g. portfolio schematic SVG)
```

---

## License / data

UI and application code are project-owned. Upstream datasets remain under their respective **open data / operator** terms. The in-app MTR diagram is the **official system map** asset; the self-made schematic is an original portfolio graphic and is not an official MTR publication.
