"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  candidatesToFeatureCollection,
  type CandidateSite,
} from "@/lib/candidate-sites";
import { LocationSearch } from "@/components/location-search";
import type { GeocodeResult } from "@/lib/geocode";
import type { ActiveSite } from "@/lib/site";
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
    properties: feature.properties ?? {},
    geometry: { type: "Polygon", coordinates: [inset] },
  };
}

export interface BuildingSpec {
  structure: Structure;
  floors: number;
}

interface SiteMapProps {
  building: BuildingSpec | null;
  activeSite: ActiveSite;
  candidates: CandidateSite[];
  selectedCandidateId: string | null;
  sitesNote?: string;
  onSearchPlace: (place: GeocodeResult) => void;
  onSelectCandidate: (site: CandidateSite) => void;
}

export function SiteMap({
  building,
  activeSite,
  candidates,
  selectedCandidateId,
  sitesNote,
  onSearchPlace,
  onSelectCandidate,
}: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const buildingRef = useRef<BuildingSpec | null>(building);
  const candidatesRef = useRef(candidates);
  const onSelectRef = useRef(onSelectCandidate);
  buildingRef.current = building;
  candidatesRef.current = candidates;
  onSelectRef.current = onSelectCandidate;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [activeSite.lng, activeSite.lat],
      zoom: activeSite.zoom,
      pitch: 55,
      bearing: -15,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      map.addSource("candidates", {
        type: "geojson",
        data: candidatesToFeatureCollection(candidatesRef.current),
      });
      map.addSource("site", { type: "geojson", data: activeSite.polygon });
      map.addSource("building", {
        type: "geojson",
        data: insetPolygon(activeSite.polygon, 0.72),
      });

      map.addLayer({
        id: "candidates-fill",
        type: "fill",
        source: "candidates",
        paint: {
          "fill-color": "#35c28f",
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "candidates-outline",
        type: "line",
        source: "candidates",
        paint: {
          "line-color": "#0d7a55",
          "line-width": 1.5,
          "line-dasharray": [2, 1],
        },
      });
      map.addLayer({
        id: "site-fill",
        type: "fill",
        source: "site",
        paint: { "fill-color": "#f5c518", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "site-outline",
        type: "line",
        source: "site",
        paint: { "line-color": "#f5c518", "line-width": 2.5 },
      });
      map.addLayer({
        id: "building-mass",
        type: "fill-extrusion",
        source: "building",
        paint: {
          "fill-extrusion-color": "#9aa5b1",
          "fill-extrusion-height": 0,
          "fill-extrusion-opacity": 0.96,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "building-shell",
        type: "fill-extrusion",
        source: "building",
        paint: {
          "fill-extrusion-color": "#f4f8fc",
          "fill-extrusion-height": 0,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.55,
          "fill-extrusion-vertical-gradient": true,
        },
      });

      map.on("click", "candidates-fill", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        const match = candidatesRef.current.find((c) => c.id === id);
        if (match) onSelectRef.current(match);
      });
      map.on("mouseenter", "candidates-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "candidates-fill", () => {
        map.getCanvas().style.cursor = "";
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
    if (!map || !readyRef.current) return;
    map.flyTo({
      center: [activeSite.lng, activeSite.lat],
      zoom: activeSite.zoom,
      essential: true,
      duration: 1400,
    });
    const siteSrc = map.getSource("site") as maplibregl.GeoJSONSource | undefined;
    const buildingSrc = map.getSource(
      "building",
    ) as maplibregl.GeoJSONSource | undefined;
    siteSrc?.setData(activeSite.polygon);
    buildingSrc?.setData(insetPolygon(activeSite.polygon, 0.72));
    syncBuilding(map, buildingRef.current);
  }, [activeSite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("candidates") as maplibregl.GeoJSONSource | undefined;
    src?.setData(candidatesToFeatureCollection(candidates));
  }, [candidates]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) syncBuilding(map, building);
  }, [building]);

  const selectedLabel =
    candidates.find((c) => c.id === selectedCandidateId)?.label ??
    activeSite.name;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Single top chrome: search left, site chip right of it; no stacked text */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto min-w-0 flex-1 pl-[300px]">
          <LocationSearch onSelect={onSearchPlace} />
        </div>
        <div className="pointer-events-none max-w-[16rem] shrink-0 rounded-md border border-panel-border bg-white/95 px-3 py-2 shadow-md">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-soft">
            Active site
          </p>
          <p className="truncate text-[12px] font-semibold text-text-strong">
            {selectedLabel}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="absolute bottom-24 right-3 z-10 grid h-8 w-8 place-items-center rounded bg-white shadow hover:bg-panel-muted"
        title="Layers"
      >
        <LayersIcon />
      </button>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 max-w-lg -translate-x-1/2 rounded bg-ink/75 px-3 py-1.5 text-center text-[10px] leading-snug text-white/90">
        {sitesNote?.trim()
          ? sitesNote
          : "Green outlines = empty OSM land (parking / brownfield / open). Click a parcel to build (not on houses or roads)."}
      </p>
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
  // Zero-height extrusions still paint a flat slab; hide the layers instead.
  const visibility = building ? "visible" : "none";
  map.setLayoutProperty("building-mass", "visibility", visibility);
  map.setLayoutProperty("building-shell", "visibility", visibility);
  if (!building) return;
  const total = building ? building.floors * 3.4 : 0;
  const lower = total * 0.55;
  const colour = building ? STRUCTURE_COLOUR[building.structure] : "#9aa5b1";
  map.setPaintProperty("building-mass", "fill-extrusion-height", lower);
  map.setPaintProperty("building-mass", "fill-extrusion-color", colour);
  map.setPaintProperty("building-shell", "fill-extrusion-base", lower);
  map.setPaintProperty("building-shell", "fill-extrusion-height", total);
}
