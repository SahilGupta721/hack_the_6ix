"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SITE, SITE_POLYGON } from "@/lib/site";
import type { Structure } from "@/lib/types";

// Primary imagery: City of Toronto 2025 orthophoto (8 cm/px, open licence,
// no key). Esri World Imagery sits underneath as the outside-city fallback.
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
    "toronto-ortho": {
      type: "raster",
      tiles: [
        "https://gis.toronto.ca/arcgis/rest/services/basemap/cot_ortho_2025_color_8cm/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution:
        "Contains information licensed under the Open Government Licence - Toronto",
    },
  },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "toronto-ortho", type: "raster", source: "toronto-ortho" },
  ],
};

const STRUCTURE_COLOUR: Record<Structure, string> = {
  concrete: "#9aa5b1",
  mass_timber: "#d97e3f",
  steel: "#7d93a8",
};

// Building footprint: the site polygon inset toward its centroid.
function insetPolygon(
  feature: GeoJSON.Feature<GeoJSON.Polygon>,
  factor: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = feature.geometry.coordinates[0];
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const inset = ring.map(([x, y]) => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ]);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [inset] },
  };
}

export interface BuildingSpec {
  structure: Structure;
  floors: number;
}

interface SiteMapProps {
  building: BuildingSpec | null;
}

export function SiteMap({ building }: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const buildingRef = useRef<BuildingSpec | null>(building);
  buildingRef.current = building;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [SITE.lng, SITE.lat],
      zoom: SITE.zoom,
      pitch: 55,
      bearing: -15,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      map.addSource("site", { type: "geojson", data: SITE_POLYGON });
      map.addSource("building", {
        type: "geojson",
        data: insetPolygon(SITE_POLYGON, 0.72),
      });
      map.addLayer({
        id: "site-fill",
        type: "fill",
        source: "site",
        paint: { "fill-color": "#f5c518", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "site-outline",
        type: "line",
        source: "site",
        paint: { "line-color": "#10151c", "line-width": 2 },
      });
      map.addLayer({
        id: "building-mass",
        type: "fill-extrusion",
        source: "building",
        paint: {
          "fill-extrusion-color": "#9aa5b1",
          "fill-extrusion-height": 0,
          "fill-extrusion-opacity": 0.92,
        },
      });
      // Unconfigured upper envelope: translucent white shell above the
      // configured structure, matching the ref sketch treatment.
      map.addLayer({
        id: "building-shell",
        type: "fill-extrusion",
        source: "building",
        paint: {
          "fill-extrusion-color": "#ffffff",
          "fill-extrusion-height": 0,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.38,
        },
      });
      readyRef.current = true;
      syncBuilding(map, buildingRef.current);
    });

    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) syncBuilding(map, building);
  }, [building]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <MapToolbar />
      <button
        className="absolute right-3 top-12 z-10 grid h-8 w-8 place-items-center rounded bg-white shadow hover:bg-panel-muted"
        title="Layers"
      >
        <LayersIcon />
      </button>
      <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded bg-white/90 px-2.5 py-1 text-[11px] font-medium text-text-strong shadow">
        SITE: {SITE.name}
      </div>
    </div>
  );
}

const TOOL_PATHS: { title: string; d: string }[] = [
  { title: "Select", d: "M5 3l10 6-4.5 1L9 15 5 3Z" },
  { title: "Line", d: "M4 14 14 4M4 14h0M14 4h0" },
  { title: "Rectangle", d: "M4 5h10v8H4z" },
  { title: "Draw", d: "M4 14l1-3 7-7 2 2-7 7-3 1Z" },
  { title: "Measure", d: "M3 12l3-3 2 2 3-3 2 2 3-3M3 12l2 2 10-10" },
];

function MapToolbar() {
  const [active, setActive] = useState(0);
  return (
    <div className="absolute left-[320px] top-12 z-10 flex items-center gap-0.5 rounded bg-white p-1 shadow">
      {TOOL_PATHS.map((tool, i) => (
        <button
          key={tool.title}
          title={tool.title}
          onClick={() => setActive(i)}
          className={`grid h-7 w-7 place-items-center rounded ${
            active === i ? "bg-panel-muted" : "hover:bg-panel-muted"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d={tool.d}
              fill="none"
              stroke="#3a4452"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
      <span className="ml-1 rounded border border-panel-border px-2 py-0.5 text-[10.5px] text-text-soft">
        Measures
      </span>
    </div>
  );
}

function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 2 16 6 9 10 2 6 9 2ZM3.5 9.5 9 12.7l5.5-3.2M3.5 12.5 9 15.7l5.5-3.2"
        fill="none"
        stroke="#3a4452"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function syncBuilding(map: maplibregl.Map, building: BuildingSpec | null) {
  if (!map.getLayer("building-mass") || !map.getLayer("building-shell")) return;
  const total = building ? building.floors * 3.4 : 0;
  const lower = total * 0.55;
  const colour = building ? STRUCTURE_COLOUR[building.structure] : "#9aa5b1";
  map.setPaintProperty("building-mass", "fill-extrusion-height", lower);
  map.setPaintProperty("building-mass", "fill-extrusion-color", colour);
  map.setPaintProperty("building-shell", "fill-extrusion-base", lower);
  map.setPaintProperty("building-shell", "fill-extrusion-height", total);
}
