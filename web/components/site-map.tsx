"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  candidatesToFeatureCollection,
  type CandidateSite,
} from "@/lib/candidate-sites";
import type { BuildComponents } from "@/lib/build-config";
import type { ShapeId } from "@/lib/building-shape";
import {
  createModularBuildingLayer,
  type ModularBuildingLayer,
} from "@/lib/maplibre-three-layer";
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

export interface BuildingSpec {
  structure: Structure;
  /** Storey count (UI "Floors"). */
  floors: number;
  shapeId?: ShapeId;
  /** Assembler kit — drives Three.js modular structure. */
  components: BuildComponents;
}

interface SiteMapProps {
  building: BuildingSpec | null;
  activeSite: ActiveSite;
  candidates: CandidateSite[];
  selectedCandidateId: string | null;
  sitesNote?: string;
  onSelectCandidate: (site: CandidateSite) => void;
}

type ModularLayer = ModularBuildingLayer;

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
  const threeLayerRef = useRef<ModularLayer | null>(null);
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
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      map.addSource("candidates", {
        type: "geojson",
        data: candidatesToFeatureCollection(candidatesRef.current),
      });
      map.addSource("site", {
        type: "geojson",
        data: activeSite.polygon ?? {
          type: "FeatureCollection",
          features: [],
        },
      });

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

      const threeLayer = createModularBuildingLayer();
      threeLayerRef.current = threeLayer;
      map.addLayer(threeLayer);
      if (activeSite.polygon) {
        threeLayer.sync(buildingRef.current, activeSite.polygon);
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
    });

    return () => {
      readyRef.current = false;
      threeLayerRef.current = null;
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
    siteSrc?.setData(
      activeSite.polygon ?? { type: "FeatureCollection", features: [] },
    );
    if (activeSite.polygon) {
      threeLayerRef.current?.sync(buildingRef.current, activeSite.polygon);
    } else {
      threeLayerRef.current?.sync(null, {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [] },
      });
    }
  }, [activeSite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("candidates") as maplibregl.GeoJSONSource | undefined;
    src?.setData(candidatesToFeatureCollection(candidates));
  }, [candidates]);

  useEffect(() => {
    if (!readyRef.current) return;
    const poly = activeSiteRef.current.polygon;
    if (poly) {
      threeLayerRef.current?.sync(building, poly);
    } else {
      threeLayerRef.current?.sync(null, {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [] },
      });
    }
  }, [building]);

  const selectedLabel =
    candidates.find((c) => c.id === selectedCandidateId)?.label ??
    (selectedCandidateId ? activeSite.name : "Click a green parcel");

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
          : "Green = OSM open land / parking (may disagree slightly with ortho). Click a parcel to select."}
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
