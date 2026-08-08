# Map feature

Renders the MapLibre map (`components/ui/map.tsx`) with Shadowbot's data
layers: the active route, exclude zones, uploaded tracks, and locations
surfaced by the chat agent.

## Layout

```
store.ts                              # Zustand store shared by chat and the map
types.ts                              # ChatLocation / ChatLocationKind
components/
  map-view.tsx                        # <Map> + <MapLayers> + <MapHud>
  map-layers.tsx                      # Composes all data-driven layers
  map-hud.tsx
  chat-location-markers.tsx           # Renders ChatLocation pins with icons
```

## Chat location markers

When the agent calls a location-producing tool (`geocode`, `find_nearby_poi`,
`find_poi_along_route`, `find_frequented_locations`), the result is plotted on
the map automatically — no user action required. The pipeline:

1. `features/chat/hooks/use-sync-chat-locations.ts` watches `useChat`'s
   `messages` for finished (`state === "output-available"`) calls to those
   tools and hands their output to `extractChatLocations`.
2. `features/chat/lib/tool-locations.ts` (`extractChatLocations`) converts the
   tool's JSON output into `ChatLocation[]` — `{ id, kind, label, longitude,
   latitude }` — and pushes them into `useMapStore.chatLocations`.
3. `chat-location-markers.tsx` reads `chatLocations` from the store and
   renders one `MapMarker` per location, picking an icon by `kind`.

### Adding a new icon

Every `ChatLocationKind` must have an entry in the `ICONS` map in
`components/chat-location-markers.tsx`. TypeScript will fail to compile if a
kind is missing, so you can't forget this step.

1. **If the kind maps to a backend `PoiCategory`** (`backend/src/shadowbot/schemas/poi.py`),
   add the matching value to `ChatLocationKind` in `types.ts` — keep the name
   identical to the backend enum value (snake_case, e.g. `"ev_charging"`) so
   `extractChatLocations` needs no translation.

   If it doesn't map to a `PoiCategory` (e.g. `"geocode"`, `"frequented"`),
   just add it to `ChatLocationKind` directly.

2. Pick an icon from [lucide-react](https://lucide.dev/icons/) — the same
   package already used across the app (`lucide-react@1.28.0`). Import it and
   add it to the `ICONS` record in `chat-location-markers.tsx`:

   ```tsx
   import { TreePine } from "lucide-react";

   const ICONS: Record<ChatLocationKind, LucideIcon> = {
     // ...
     campground: TreePine,
   };
   ```

3. If the new kind is produced by a tool not already listed in
   `tool-locations.ts`, add a mapping function there (see `toPoiLocation` /
   `toGeocodeLocation` for the pattern — each takes a single raw JSON item and
   returns a `ChatLocation | null`) and register the tool's name in
   `LOCATION_TOOL_NAMES`.

Markers are theme-neutral by design (a bordered square in the app's `signal`
accent color, per `app/globals.css`) — swap the icon, not the styling, unless
a specific location kind genuinely warrants a different treatment.
