/** Free OSM tiles — no API key; detailed street map. */
export const OSM_BASEMAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_BASEMAP_MAX_ZOOM = 19;

export const OSM_BASEMAP_ATTR = "&copy; OpenStreetMap";

/** @deprecated Esri dark gray caps around zoom 16 and blanks when zoomed further. */
export const DARK_BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

export const DARK_BASEMAP_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

export const DARK_BASEMAP_MAX_ZOOM = 16;

type GoogleMapStyle = {
  elementType?: string;
  featureType?: string;
  stylers: Array<Record<string, string | number | boolean>>;
};

/** Google night style when Maps JS API key is available. */
export const GOOGLE_DARK_STYLES: GoogleMapStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1d2c3a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d2c3a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aa3b0" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#163024" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#304556" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1d2c3a" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3a5266" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2a3b4a" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8aa3b0" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0b1520" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a6578" }],
  },
];
