"use client";

import {
  type LineId,
  type Puzzle,
  type StationId,
  lineMeta,
  routeLineGeoJson,
  stationCoord,
  stationName,
} from "@/lib/subwayEngine";
import { LineBullet } from "@/components/LineBullet";
import { useEffect, useMemo, useRef, useState } from "react";

type SolutionMapProps = {
  puzzle: Puzzle;
  showJourney?: boolean;
};

type MapStatus = "original" | "carto" | "static";

const width = 464;
const height = 310;
const padding = 34;
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const subwaydleStyle = "mapbox://styles/theweekendest/ck1fhati848311cp6ezdzj5cm?optimize=true";
const manhattanTilt = 29;
const cartoDarkStyle = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
  },
  layers: [
    {
      id: "carto-dark",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
} satisfies import("mapbox-gl").StyleSpecification;

const project = (
  coord: [number, number],
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
) => {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const x = padding + ((coord[0] - bounds.minLng) / lngSpan) * (width - padding * 2);
  const y = height - padding - ((coord[1] - bounds.minLat) / latSpan) * (height - padding * 2);
  return [x, y] as [number, number];
};

const lineFeature = (line: LineId, begin: StationId, end: StationId) => ({
  type: "Feature" as const,
  properties: {
    color: lineMeta(line).color,
  },
  geometry: {
    type: "LineString" as const,
    coordinates: routeLineGeoJson(line, begin, end),
  },
});

const stopsForPuzzle = (puzzle: Puzzle) => [
  puzzle.route.solution.origin,
  puzzle.route.solution.first_transfer_arrival,
  puzzle.route.solution.first_transfer_departure,
  puzzle.route.solution.second_transfer_arrival,
  puzzle.route.solution.second_transfer_departure,
  puzzle.route.solution.destination,
];

function FallbackMap({ puzzle }: SolutionMapProps) {
  const segments = useMemo(() => puzzle.solution.map((line, index) => {
    const leg = puzzle.route.legs[index];
    const coordinates = routeLineGeoJson(line, leg[0], leg[leg.length - 1]);
    return { line, coordinates, leg };
  }), [puzzle]);

  const routeCoords = segments.flatMap((segment) => segment.coordinates);
  const markerStops = stopsForPuzzle(puzzle);
  const markerCoords = [...new Set(markerStops)].map((station) => stationCoord(station));
  const allCoords = [...routeCoords, ...markerCoords];
  const bounds = {
    minLng: Math.min(...allCoords.map((coord) => coord[0])),
    maxLng: Math.max(...allCoords.map((coord) => coord[0])),
    minLat: Math.min(...allCoords.map((coord) => coord[1])),
    maxLat: Math.max(...allCoords.map((coord) => coord[1])),
  };

  return (
    <div className="rounded bg-[#101214] p-3">
      <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Solution route map">
        <rect width={width} height={height} fill="#111416" rx="4" />
        <path
          d="M43 23 C91 63 93 103 142 112 C200 124 230 68 292 91 C335 108 365 152 412 161 C445 168 463 201 456 244 C449 286 411 304 362 287 C313 270 270 257 214 275 C154 294 109 269 84 224 C55 173 18 157 26 101 C30 68 24 42 43 23 Z"
          fill="#202427"
          opacity="0.92"
        />
        <path
          d="M330 22 C372 34 428 57 449 91 C471 126 453 161 416 171 C386 179 368 151 372 118 C376 79 312 71 330 22 Z"
          fill="#25292c"
          opacity="0.75"
        />
        <g opacity="0.26" stroke="#596066" strokeLinecap="round" strokeWidth="1.1">
          <path d="M45 64 C120 93 151 124 202 113 C248 103 279 133 319 159 C364 190 401 205 448 210" />
          <path d="M31 159 C90 148 135 169 179 199 C228 231 280 222 333 237 C374 248 413 263 454 258" />
          <path d="M91 28 C111 101 105 153 133 215 C147 247 163 276 199 300" />
          <path d="M282 32 C267 83 256 127 276 179 C293 222 294 266 279 302" />
        </g>
        {segments.map((segment, index) => {
          const points = segment.coordinates.map((coord) => project(coord, bounds).join(",")).join(" ");
          return (
            <g key={`${segment.line}-${index}`}>
              <polyline
                points={points}
                fill="none"
                stroke="#0a0b0c"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="8"
                opacity="0.82"
              />
              <polyline
                points={points}
                fill="none"
                stroke={lineMeta(segment.line).color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            </g>
          );
        })}
        {[...new Set(markerStops)].map((station) => {
          const [x, y] = project(stationCoord(station), bounds);
          return (
            <g key={station}>
              <circle cx={x} cy={y} r="5.5" fill="#ffffff" stroke="#0b0d0f" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function JourneyList({ puzzle }: SolutionMapProps) {
  return (
    <div className="mt-4 text-left">
      <h3 className="mb-2 text-lg font-bold text-white">Route Journey</h3>
      <div className="space-y-1 text-sm font-semibold text-white">
        {puzzle.solution.map((line, index) => {
          const leg = puzzle.route.legs[index];
          return (
            <div className="flex items-center gap-2" key={`${line}-${index}`}>
              <LineBullet line={line} size="sm" />
              <span>
                from {stationName(leg[0])} to {stationName(leg[leg.length - 1])}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapboxMap({ puzzle, mode, onFallback }: SolutionMapProps & { mode: Exclude<MapStatus, "static">; onFallback: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markersRef = useRef<import("mapbox-gl").Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    const load = async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (mapboxToken && mode === "original") {
          mapboxgl.accessToken = mapboxToken;
        }

        if (cancelled || !containerRef.current) return;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: mode === "original" ? subwaydleStyle : cartoDarkStyle,
          center: [-73.98119, 40.75855],
          bearing: manhattanTilt,
          minZoom: 9,
          zoom: 12,
          maxBounds: [
            [-74.8113, 40.1797],
            [-73.3584, 41.1247],
          ],
          maxPitch: 0,
          interactive: true,
        });
        mapRef.current = map;

        map.on("load", () => {
          const lineDefs = puzzle.solution.map((line, index) => {
            const leg = puzzle.route.legs[index];
            return lineFeature(line, leg[0], leg[leg.length - 1]);
          });

          const coordinates: [number, number][] = [];
          lineDefs.forEach((feature, index) => {
            coordinates.push(...feature.geometry.coordinates);
            const layerId = `solution-line-${index}`;
            map.addSource(layerId, {
              type: "geojson",
              data: feature,
            });
            map.addLayer({
              id: layerId,
              type: "line",
              source: layerId,
              layout: {
                "line-join": "miter",
                "line-cap": "round",
              },
              paint: {
                "line-width": mode === "original" ? 2 : 4,
                "line-color": ["get", "color"],
              },
            });
          });

          const stops = [...new Set(stopsForPuzzle(puzzle))];
          if (mode === "original") {
            map.addSource("solution-stops", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: stops.map((station) => ({
                  type: "Feature",
                  properties: {
                    id: station,
                    name: stationName(station),
                  },
                  geometry: {
                    type: "Point",
                    coordinates: stationCoord(station),
                  },
                })),
              },
            });
            map.addLayer({
              id: "solution-stops",
              type: "symbol",
              source: "solution-stops",
              layout: {
                "text-field": ["get", "name"],
                "text-size": 12,
                "text-font": ["Lato Bold", "Open Sans Bold", "Arial Unicode MS Bold"],
                "text-optional": false,
                "text-justify": "auto",
                "text-allow-overlap": false,
                "text-padding": 1,
                "text-variable-anchor": ["bottom-right", "top-right", "bottom-left", "top-left", "right", "left", "bottom"],
                "text-radial-offset": 0.5,
                "icon-image": "express-stop",
                "icon-size": 8 / 13,
                "icon-allow-overlap": true,
              },
              paint: {
                "text-color": "#ffffff",
              },
            });
          } else {
            markersRef.current = stops.map((station, index) => {
              const marker = document.createElement("div");
              marker.className = "solution-map-marker";
              marker.innerHTML = `<span></span><strong>${stationName(station)}</strong>`;

              return new mapboxgl.Marker({
                element: marker,
                anchor: index % 2 === 0 ? "bottom-left" : "top-left",
                offset: [4, index % 2 === 0 ? -4 : 4],
              })
                .setLngLat(stationCoord(station))
                .addTo(map);
            });
          }

          const bounds = coordinates.reduce(
            (nextBounds, coord) => nextBounds.extend(coord),
            new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
          );
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, {
              padding: {
                top: 20,
                right: 20,
                left: 20,
                bottom: 150,
              },
              bearing: manhattanTilt,
            });
          }
        });

        map.on("error", () => onFallback());
      } catch {
        onFallback();
      }
    };

    void load();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mode, onFallback, puzzle]);

  return <div ref={containerRef} className="h-[400px] overflow-hidden rounded bg-[#101214]" />;
}

export function SolutionMap({ puzzle, showJourney = true }: SolutionMapProps) {
  const [status, setStatus] = useState<MapStatus>(mapboxToken ? "original" : "carto");

  if (status === "static") {
    return (
      <>
        <FallbackMap puzzle={puzzle} />
        {showJourney ? <JourneyList puzzle={puzzle} /> : null}
      </>
    );
  }

  return (
    <>
      <div className="rounded bg-[#101214] p-0">
      <MapboxMap
        key={`${puzzle.id}-${status}`}
        puzzle={puzzle}
        mode={status}
        onFallback={() => setStatus((current) => (current === "original" ? "carto" : "static"))}
      />
      </div>
      {showJourney ? <JourneyList puzzle={puzzle} /> : null}
    </>
  );
}
