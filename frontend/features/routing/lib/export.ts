import type { Route } from "@/features/routing/types";

function download(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds a GPX 1.1 document for a route's path, plus waypoints for its origin/stops/destination. */
export function routeToGpx(route: Route): string {
  const trackPoints = (route.geometry.coordinates as [number, number][])
    .map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}" />`)
    .join("\n");

  const stops: { label: string; coordinates: [number, number] }[] = [
    { label: "Origin", coordinates: route.origin.coordinates as [number, number] },
    ...route.waypoints.map((point, i) => ({ label: `Stop ${i + 1}`, coordinates: point.coordinates as [number, number] })),
    { label: "Destination", coordinates: route.destination.coordinates as [number, number] },
  ];
  const waypoints = stops
    .map(
      ({ label, coordinates: [lng, lat] }) =>
        `  <wpt lat="${lat}" lon="${lng}"><name>${escapeXml(label)}</name></wpt>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Shadowbot" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
  <trk>
    <name>Route</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Builds a CSV of the route's path coordinates, one row per point in travel order. */
export function routeToCsv(route: Route): string {
  const header = "sequence,lat,lng";
  const rows = (route.geometry.coordinates as [number, number][]).map(
    ([lng, lat], i) => `${i},${lat},${lng}`,
  );
  return [header, ...rows].join("\n");
}

export function downloadRouteGpx(route: Route): void {
  download(`route-${route.id}.gpx`, routeToGpx(route), "application/gpx+xml");
}

export function downloadRouteCsv(route: Route): void {
  download(`route-${route.id}.csv`, routeToCsv(route), "text/csv");
}
