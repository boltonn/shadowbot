const METERS_PER_MILE = 1609.344;

/** Formats a distance in meters as miles, e.g. "4.2 mi". */
export function formatDistance(distanceM: number): string {
  return `${(distanceM / METERS_PER_MILE).toFixed(1)} mi`;
}

/** Formats a duration in seconds as "1h 24m" (or "42m" / "<1m" for shorter spans). */
export function formatDuration(durationS: number): string {
  const totalMinutes = Math.round(durationS / 60);
  if (totalMinutes < 1) return "<1m";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
