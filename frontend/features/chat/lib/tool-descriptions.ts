/** Short, human-readable labels for agent tool calls, shown in the chat's collapsed tool header. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nested(input: Record<string, unknown>, key = "request"): Record<string, unknown> {
  return isRecord(input[key]) ? (input[key] as Record<string, unknown>) : input;
}

function categoryList(input: Record<string, unknown>): string | undefined {
  const request = nested(input);
  const categories = request.categories;
  if (!Array.isArray(categories) || categories.length === 0) return undefined;
  return categories.filter((c): c is string => typeof c === "string").join(", ");
}

const TOOL_LABELS: Record<string, string> = {
  geocode: "Geocoding",
  plan_route: "Planning route",
  search_routes: "Searching routes",
  find_area_features: "Finding area features",
  reroute: "Rerouting",
  compare_routes: "Comparing routes",
  estimate_arrival: "Estimating arrival",
  get_isochrone: "Computing isochrone",
  find_nearby_poi: "Finding nearby POIs",
  find_poi_along_route: "Finding POIs along route",
  list_tracks: "Listing tracks",
  get_track: "Getting track",
  match_track: "Matching track to roads",
  find_frequented_locations: "Finding frequented locations",
  save_location_label: "Saving location label",
  list_point_datasets: "Listing point datasets",
  find_point_dataset_along_route: "Finding dataset features along route",
  list_polygon_datasets: "Listing polygon datasets",
  update_map_locations: "Updating map",
  get_routing_coverage: "Checking routing coverage",
  suggest_coverage_request_url: "Building coverage request link",
};

const TOOL_DETAILS: Record<string, (input: Record<string, unknown>) => string | undefined> = {
  geocode: (input) => str(input.query),
  reroute: (input) => str(input.route_id),
  estimate_arrival: (input) => str(input.route_id),
  find_poi_along_route: (input) => categoryList(input) ?? str(input.route_id),
  find_point_dataset_along_route: (input) => str(input.dataset_id),
  get_track: (input) => str(input.track_id),
  match_track: (input) => str(input.track_id),
  find_nearby_poi: categoryList,
  find_area_features: categoryList,
  compare_routes: (input) => {
    const a = str(input.route_id_a);
    const b = str(input.route_id_b);
    return a && b ? `${a} vs ${b}` : undefined;
  },
  save_location_label: (input) => {
    const request = nested(input);
    return str(request.name) ?? str(request.category);
  },
  suggest_coverage_request_url: (input) => str(input.place),
};

/** A brief "Verb-ing: detail" label for a tool call, falling back to its raw name if unmapped. */
export function describeToolCall(toolName: string, input: unknown): string {
  const label = TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
  const detail = isRecord(input) ? TOOL_DETAILS[toolName]?.(input) : undefined;
  return detail ? `${label}: ${detail}` : label;
}
