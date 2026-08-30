/** Free OSM fallback — no API key; works past Esri’s ~zoom 16 limit. */
export const OSM_BASEMAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_BASEMAP_MAX_ZOOM = 19;

/** @deprecated Esri dark gray caps around zoom 16 and blanks when zoomed further. */
export const DARK_BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

export const DARK_BASEMAP_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

export const DARK_BASEMAP_MAX_ZOOM = 16;
