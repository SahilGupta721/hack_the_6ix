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
  rooms?: number;
}

interface SiteMapProps {
  building: BuildingSpec | null;
  activeSite: ActiveSite;
  candidates: CandidateSite[];
  selectedCandidateId: string | null;
  sitesNote?: string;
  onSelectCandidate: (site: CandidateSite) => void;
  /** Fired when the user pans somewhere new, so plots refresh for that view. */
  onViewportChange?: (lat: number, lng: number, zoom: number) => void;
}

type ModularLayer = ModularBuildingLayer;

export function SiteMap({
  building,
  activeSite,
  candidates,
  selectedCandidateId,
  sitesNote,
  onSelectCandidate,
  onViewportChange,
}: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const threeLayerRef = useRef<ModularLayer | null>(null);
  const buildingRef = useRef<BuildingSpec | null>(building);
  const activeSiteRef = useRef(activeSite);
  const candidatesRef = useRef(candidates);
  const onSelectRef = useRef(onSelectCandidate);
  const onViewportRef = useRef(onViewportChange);
  const lastFetchRef = useRef({ lat: activeSite.lat, lng: activeSite.lng });
  buildingRef.current = building;
  activeSiteRef.current = activeSite;
  candidatesRef.current = candidates;
  onSelectRef.current = onSelectCandidate;
  onViewportRef.current = onViewportChange;

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
      void loadCompetitorPins(map, activeSite.lat, activeSite.lng);

      // Context buildings, pins, and (via the callback) green plots follow
      // wherever the user pans — not only searched or default locations.
      // Only genuine user gestures (drag/scroll) carry an originalEvent;
      // skipping programmatic flyTo (initial land, parcel select, search)
      // keeps the auto-selected parcel from being orphaned by a refetch.
      map.on("moveend", (e) => {
        if (!(e as { originalEvent?: unknown }).originalEvent) return;
        if (map.getZoom() < 13) return;
        const c = map.getCenter();
        const last = lastFetchRef.current;
        const dx = (c.lng - last.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
        const dy = (c.lat - last.lat) * 111;
        if (Math.hypot(dx, dy) < 0.4) return;
        lastFetchRef.current = { lat: c.lat, lng: c.lng };
        void loadContextBuildings(map, c.lat, c.lng);
        void loadCompetitorPins(map, c.lat, c.lng);
        onViewportRef.current?.(c.lat, c.lng, map.getZoom());
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
    lastFetchRef.current = { lat: activeSite.lat, lng: activeSite.lng };
    void loadContextBuildings(map, activeSite.lat, activeSite.lng);
    void loadCompetitorPins(map, activeSite.lat, activeSite.lng);
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

      <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-[16rem]">
        <div className="border border-white/15 bg-ink/75 px-3 py-2 backdrop-blur-sm">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-white/55">
            Active site
          </p>
          <p className="truncate text-[12px] font-semibold text-white">
            {selectedLabel}
          </p>
          <p className="mt-1 text-[9.5px] leading-snug text-white/65">
            {sitesNote?.trim()
              ? sitesNote
              : "Green = OSM open land. Click a parcel to select."}
          </p>
        </div>
      </div>
    </div>
  );
}

let pinMarkers: maplibregl.Marker[] = [];
let pinFetchSeq = 0;

async function loadCompetitorPins(
  map: maplibregl.Map,
  lat: number,
  lng: number,
) {
  if (process.env.NEXT_PUBLIC_FLAG_STAY22 !== "true") return;
  const seq = ++pinFetchSeq;
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const res = await fetch(`${base}/stay22/market?lat=${lat}&lng=${lng}`);
    if (!res.ok || seq !== pinFetchSeq) return;
    const data = (await res.json()) as {
      target?: { pins?: { name: string; lat: number; lng: number; rate: number | null; stars?: number | null }[] };
    };
    if (seq !== pinFetchSeq) return;
    pinMarkers.forEach((m) => m.remove());
    pinMarkers = [];
    for (const pin of data.target?.pins ?? []) {
      if (pin.rate == null) continue;
      const el = document.createElement("div");
      el.className =
        "rounded-full border border-white/60 bg-[#123346]/90 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow";
      el.textContent = `$${pin.rate}${pin.stars ? ` · ${pin.stars}★` : ""}`;
      el.title = `${pin.name}: live rate via Stay22 (Booking, Expedia, Hotels.com, Vrbo)`;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      pinMarkers.push(marker);
    }
  } catch {
    // Live competitive layer is optional; the map is complete without it.
  }
}

let contextFetchSeq = 0;

async function loadContextBuildings(
  map: maplibregl.Map,
  lat: number,
  lng: number,
) {
  const seq = ++contextFetchSeq;
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const res = await fetch(
      `${base}/sites/context?lat=${lat}&lng=${lng}&radius=450`,
    );
    if (!res.ok || seq !== contextFetchSeq) return;
    const data = (await res.json()) as GeoJSON.FeatureCollection;
    if (seq !== contextFetchSeq) return;
    const src = map.getSource(
      "context-buildings",
    ) as maplibregl.GeoJSONSource | undefined;
    src?.setData(data);
  } catch {
    // Context layer is decorative; the map is complete without it.
  }
}
