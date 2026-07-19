"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  candidatesToFeatureCollection,
  type CandidateSite,
} from "@/lib/candidate-sites";
import { getShape, type ShapeId } from "@/lib/building-shape";
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

function openRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  ) {
    return ring.slice(0, -1);
  }
  return ring.slice();
}

function closeRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

/** Signed area in lng/lat; positive => counter-clockwise. */
function ringSignedArea(open: GeoJSON.Position[]): number {
  let sum = 0;
  for (let i = 0; i < open.length; i++) {
    const [x1, y1] = open[i];
    const [x2, y2] = open[(i + 1) % open.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** MapLibre fill-extrusion expects CCW exterior rings. */
function ensureCcw(open: GeoJSON.Position[]): GeoJSON.Position[] {
  return ringSignedArea(open) < 0 ? open.slice().reverse() : open;
}

/**
 * Shrink parcel toward centroid. Uses a clean CCW ring so pitched extrusions
 * do not drop a corner (clockwise rings are a known MapLibre footgun).
 */
function insetPolygon(
  feature: GeoJSON.Feature<GeoJSON.Polygon>,
  factor: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const open = ensureCcw(openRing(feature.geometry.coordinates[0]));
  if (open.length < 3) {
    return feature;
  }
  const cx = open.reduce((s, p) => s + p[0], 0) / open.length;
  const cy = open.reduce((s, p) => s + p[1], 0) / open.length;
  const inset = open.map(([x, y]) => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ]);
  return {
    type: "Feature",
    properties: feature.properties ?? {},
    geometry: { type: "Polygon", coordinates: [closeRing(inset)] },
  };
}

const BUILDING_RING_COUNT = 3;

function ringSourceId(i: number): string {
  return `building-ring-src-${i}`;
}

function ringLayerId(i: number): string {
  return `building-ring-layer-${i}`;
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function ensureBuildingRingLayers(map: maplibregl.Map): void {
  for (let i = 0; i < BUILDING_RING_COUNT; i++) {
    const srcId = ringSourceId(i);
    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: "geojson", data: emptyFc() });
    }
  }
}

export interface BuildingSpec {
  structure: Structure;
  /** Storey count (UI "Floors"). */
  floors: number;
  shapeId?: ShapeId;
}

interface SiteMapProps {
  building: BuildingSpec | null;
  activeSite: ActiveSite;
  candidates: CandidateSite[];
  selectedCandidateId: string | null;
  sitesNote?: string;
  onSelectCandidate: (site: CandidateSite) => void;
}

export function SiteMap({
  building,
  activeSite,
  candidates,
  selectedCandidateId,
  sitesNote,
  onSelectCandidate,
}: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const buildingRef = useRef<BuildingSpec | null>(building);
  const activeSiteRef = useRef(activeSite);
  const candidatesRef = useRef(candidates);
  const onSelectRef = useRef(onSelectCandidate);
  buildingRef.current = building;
  activeSiteRef.current = activeSite;
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
      // Per-ring sources (nested footprints must not share one GeoJSON source —
      // MapLibre's extrusion pass punches holes through overlapping features).
      ensureBuildingRingLayers(map);

      map.addSource("context-buildings", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "context-buildings",
        type: "fill-extrusion",
        source: "context-buildings",
        paint: {
          "fill-extrusion-color": "#d7dce2",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-opacity": 0.42,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      void loadContextBuildings(map, activeSite.lat, activeSite.lng);

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
        paint: { "fill-color": "#c4a35a", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "site-outline",
        type: "line",
        source: "site",
        paint: { "line-color": "#c4a35a", "line-width": 2.5 },
      });
      // Re-add ring layers above site fill so massing stays on top of the pad.
      for (let i = 0; i < BUILDING_RING_COUNT; i++) {
        const layerId = ringLayerId(i);
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        map.addLayer({
          id: layerId,
          type: "fill-extrusion",
          source: ringSourceId(i),
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": ["get", "colour"],
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-opacity": 0.96,
            "fill-extrusion-vertical-gradient": true,
          },
        });
      }

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
      syncBuilding(map, buildingRef.current, activeSite.polygon);
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
    siteSrc?.setData(activeSite.polygon);
    syncBuilding(map, buildingRef.current, activeSite.polygon);
  }, [activeSite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("candidates") as maplibregl.GeoJSONSource | undefined;
    src?.setData(candidatesToFeatureCollection(candidates));
  }, [candidates]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) {
      syncBuilding(map, building, activeSiteRef.current.polygon);
    }
  }, [building]);

  const selectedLabel =
    candidates.find((c) => c.id === selectedCandidateId)?.label ??
    activeSite.name;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-[15rem]">
        <div className="rounded-md border border-white/20 bg-ink/80 px-3 py-2 shadow-lg backdrop-blur-sm">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-white/55">
            Active site
          </p>
          <p className="truncate text-[12px] font-semibold text-white">
            {selectedLabel}
          </p>
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 max-w-md -translate-x-1/2 rounded-md bg-ink/80 px-3 py-1.5 text-center text-[10px] leading-snug text-white/90 backdrop-blur-sm">
        {sitesNote?.trim()
          ? sitesNote
          : "Green = open OSM land. Click a parcel to select — not buildings or roads."}
      </p>
    </div>
  );
}

async function loadContextBuildings(
  map: maplibregl.Map,
  lat: number,
  lng: number,
) {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const res = await fetch(
      `${base}/sites/context?lat=${lat}&lng=${lng}&radius=450`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as GeoJSON.FeatureCollection;
    const src = map.getSource(
      "context-buildings",
    ) as maplibregl.GeoJSONSource | undefined;
    src?.setData(data);
  } catch {
    // Context layer is decorative; the map is complete without it.
  }
}

function syncBuilding(
  map: maplibregl.Map,
  building: BuildingSpec | null,
  parcel: GeoJSON.Feature<GeoJSON.Polygon>,
) {
  ensureBuildingRingLayers(map);

  const clearAll = () => {
    for (let i = 0; i < BUILDING_RING_COUNT; i++) {
      const src = map.getSource(ringSourceId(i)) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(emptyFc());
      if (map.getLayer(ringLayerId(i))) {
        map.setLayoutProperty(ringLayerId(i), "visibility", "none");
      }
    }
  };

  if (!building) {
    clearAll();
    return;
  }

  const shape = getShape(building.shapeId ?? "slab");
  const rings = shape.massing(building.floors);
  const colour = STRUCTURE_COLOUR[building.structure];
  const metrePerStorey = 3.4;

  for (let i = 0; i < BUILDING_RING_COUNT; i++) {
    const src = map.getSource(ringSourceId(i)) as
      | maplibregl.GeoJSONSource
      | undefined;
    const layerId = ringLayerId(i);
    if (!src || !map.getLayer(layerId)) continue;

    if (i >= rings.length) {
      src.setData(emptyFc());
      map.setLayoutProperty(layerId, "visibility", "none");
      continue;
    }

    const ring = rings[i];
    const poly = insetPolygon(parcel, ring.inset);
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            colour,
            base: ring.fromLevel * metrePerStorey,
            height: ring.toLevel * metrePerStorey,
          },
          geometry: poly.geometry,
        },
      ],
    });
    map.setLayoutProperty(layerId, "visibility", "visible");
  }
}
