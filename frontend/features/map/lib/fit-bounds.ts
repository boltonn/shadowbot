import type { Map as MapLibreMap } from "maplibre-gl";

type FitOptions = {
  padding?: number;
  maxZoom?: number;
  singlePointZoom?: number;
};

/**
 * Frames the map around a set of [longitude, latitude] coordinates. A single
 * coordinate flies to that point instead of calling fitBounds, which needs
 * two distinct corners.
 */
export function fitToCoordinates(
  map: MapLibreMap,
  coordinates: [number, number][],
  { padding = 64, maxZoom = 15, singlePointZoom = 14 }: FitOptions = {},
) {
  if (coordinates.length === 0) return;

  if (coordinates.length === 1) {
    map.flyTo({ center: coordinates[0], zoom: Math.max(map.getZoom(), singlePointZoom), duration: 800 });
    return;
  }

  let minLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLng = coordinates[0][0];
  let maxLat = coordinates[0][1];
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding, maxZoom, duration: 800 },
  );
}
