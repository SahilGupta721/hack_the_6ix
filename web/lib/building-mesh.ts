import * as THREE from "three";
import type { BuildComponents } from "@/lib/build-config";
import type { ShapeId } from "@/lib/building-shape";
import type { Structure } from "@/lib/types";

export const METRE_PER_STOREY = 3.4;

export interface LocalRing {
  /**
   * Footprint in local metres for MapLibre getMatrixForModel:
   * X = east, Y = up, Z = south.
   */
  points: Array<{ x: number; z: number }>;
  /** Optional inner hole (courtyard), same coordinate frame. */
  hole?: Array<{ x: number; z: number }>;
  fromLevel: number;
  toLevel: number;
}

export interface MeshBuildingSpec {
  structure: Structure;
  floors: number;
  shapeId?: ShapeId;
  components: BuildComponents;
  /** Total key count; drives facade bay rhythm and floor-plate scale. */
  rooms?: number;
}

/**
 * Grey ghost = planned envelope on the real parcel polygon.
 * Bronze / steel = open kit on those same edges (never an AABB box).
 */
const COLOURS = {
  ghost: 0xd8dde3,
  ghostEdge: 0x9aa3ad,
  timber: 0xc4783a,
  timberDeep: 0xa85f28,
  steel: 0x8a9bab,
  steelDark: 0x4a5c6e,
  concrete: 0x9aa5b1,
  foundation: 0x6e7680,
  glass: 0xa8d4e8,
};

function disposeObject(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      geos.add(obj.geometry);
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => mats.add(x));
      else mats.add(m);
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

function mat(
  color: number,
  opts?: {
    transparent?: boolean;
    opacity?: number;
    metalness?: number;
    roughness?: number;
    depthWrite?: boolean;
  },
) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    metalness: opts?.metalness ?? 0.12,
    roughness: opts?.roughness ?? 0.78,
    depthWrite:
      opts?.depthWrite ?? !(opts?.transparent && (opts.opacity ?? 1) < 0.9),
  });
}

function centroidOf(points: Array<{ x: number; z: number }>) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cz = points.reduce((s, p) => s + p.z, 0) / points.length;
  return { cx, cz };
}

/** Shrink polygon toward centroid (0..1). Keeps street-grid orientation. */
function insetPoints(
  points: Array<{ x: number; z: number }>,
  factor: number,
): Array<{ x: number; z: number }> {
  const { cx, cz } = centroidOf(points);
  return points.map((p) => ({
    x: cx + (p.x - cx) * factor,
    z: cz + (p.z - cz) * factor,
  }));
}

function toShape(
  points: Array<{ x: number; z: number }>,
  hole?: Array<{ x: number; z: number }>,
): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].z);
  }
  shape.closePath();
  if (hole && hole.length >= 3) {
    const path = new THREE.Path();
    path.moveTo(hole[0].x, hole[0].z);
    for (let i = 1; i < hole.length; i++) {
      path.lineTo(hole[i].x, hole[i].z);
    }
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

/** Extrude parcel polygon into a vertical prism (Y-up). */
function extrudeFootprint(
  points: Array<{ x: number; z: number }>,
  height: number,
  yBottom: number,
  material: THREE.Material,
  hole?: Array<{ x: number; z: number }>,
): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(toShape(points, hole), {
    depth: height,
    bevelEnabled: false,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height + yBottom, 0);
  return new THREE.Mesh(geo, material);
}

/** Thin horizontal slab matching the parcel (or inset). */
function makePolygonSlab(
  points: Array<{ x: number; z: number }>,
  thickness: number,
  yBottom: number,
  material: THREE.Material,
  hole?: Array<{ x: number; z: number }>,
): THREE.Mesh {
  return extrudeFootprint(points, thickness, yBottom, material, hole);
}

function edgePoints(points: Array<{ x: number; z: number }>) {
  const edges: Array<{
    ax: number;
    az: number;
    bx: number;
    bz: number;
    len: number;
    mx: number;
    mz: number;
  }> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    edges.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      len,
      mx: (a.x + b.x) / 2,
      mz: (a.z + b.z) / 2,
    });
  }
  return edges;
}

/** Grey ghost prism on the real footprint + wire edges + storey lines. */
function addGhostEnvelope(
  root: THREE.Group,
  points: Array<{ x: number; z: number }>,
  fromLevel: number,
  toLevel: number,
  ghostFill: THREE.Material,
  ghostLine: THREE.LineBasicMaterial,
  hole?: Array<{ x: number; z: number }>,
) {
  const h = (toLevel - fromLevel) * METRE_PER_STOREY;
  if (h < 0.5 || points.length < 3) return;

  const y0 = fromLevel * METRE_PER_STOREY;
  const fill = extrudeFootprint(points, h, y0, ghostFill, hole);
  fill.renderOrder = 1;
  root.add(fill);

  const edgesGeo = new THREE.EdgesGeometry(fill.geometry);
  const lines = new THREE.LineSegments(edgesGeo, ghostLine);
  lines.position.copy(fill.position);
  lines.rotation.copy(fill.rotation);
  lines.renderOrder = 2;
  root.add(lines);

  const bandMat = mat(COLOURS.ghostEdge, {
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  for (let level = fromLevel + 1; level < toLevel; level++) {
    const y = level * METRE_PER_STOREY;
    const band = makePolygonSlab(points, 0.05, y - 0.025, bandMat, hole);
    band.renderOrder = 2;
    root.add(band);
  }
}

export function buildModularBuilding(
  spec: MeshBuildingSpec,
  rings: LocalRing[],
): THREE.Group {
  const root = new THREE.Group();
  root.name = "modular-building";

  const c = spec.components;
  const timber = c.mainStructure === "timber";
  const steel = c.mainStructure === "steel_brace";
  const floorTimber = c.floors === "mass_timber";

  const ghostFill = mat(COLOURS.ghost, {
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    roughness: 0.95,
  });
  const ghostLine = new THREE.LineBasicMaterial({
    color: COLOURS.ghostEdge,
    transparent: true,
    opacity: 0.6,
  });

  const structMat = mat(timber ? COLOURS.timber : COLOURS.steel, {
    metalness: steel ? 0.55 : 0.06,
    roughness: steel ? 0.32 : 0.82,
  });
  const beamMat = mat(timber ? COLOURS.timberDeep : COLOURS.steelDark, {
    metalness: steel ? 0.5 : 0.08,
    roughness: steel ? 0.35 : 0.8,
  });
  const floorMat = mat(floorTimber ? COLOURS.timber : COLOURS.concrete, {
    roughness: floorTimber ? 0.88 : 0.7,
    transparent: true,
    opacity: floorTimber ? 0.9 : 0.72,
  });
  const braceMat = mat(COLOURS.steelDark, { metalness: 0.65, roughness: 0.28 });
  const glassMat = mat(COLOURS.glass, {
    transparent: true,
    opacity: 0.16,
    metalness: 0.15,
    roughness: 0.12,
    depthWrite: false,
  });
  const mullionMat = mat(COLOURS.ghostEdge, { metalness: 0.25, roughness: 0.55 });
  const foundMat = mat(COLOURS.foundation, { roughness: 0.9 });

  const colSize = timber ? 0.48 : 0.28;
  const beamSize = timber ? 0.36 : 0.2;
  const floorThick = floorTimber ? 0.28 : 0.2;
  const maxTo = Math.max(...rings.map((r) => r.toLevel), 1);

  // Facade bay width follows rooms per storey: each key wants a bay, so a
  // denser room program reads as a busier facade. Falls back to 3.4 m.
  const roomsPerStorey =
    spec.rooms && spec.floors > 0 ? spec.rooms / spec.floors : null;

  // Floor plate vs room density: sparse programs open toward the ghost
  // envelope (larger suites); denser programs pull the plate in. Ghost stays
  // the full allowed envelope either way.
  const fit =
    roomsPerStorey && roomsPerStorey > 0
      ? Math.min(0.98, Math.max(0.1, 2.2 / (roomsPerStorey + 0.5)))
      : 1;

  for (const ring of rings) {
    if (ring.points.length < 3) continue;
    const structPts = fit < 1 ? insetPoints(ring.points, fit) : ring.points;
    const edges = edgePoints(structPts);
    if (edges.length === 0) continue;
    const ringPerimeter = edges.reduce((sum, e) => sum + e.len, 0);
    const { cx, cz } = centroidOf(structPts);

    // Ghost + structure share the same parcel polygon (street-aligned).
    addGhostEnvelope(
      root,
      ring.points,
      ring.fromLevel,
      ring.toLevel,
      ghostFill,
      ghostLine,
      ring.hole,
    );

    if (ring.fromLevel === 0) {
      if (c.foundation === "reinforced_concrete") {
        root.add(
          makePolygonSlab(insetPoints(structPts, 0.96), 0.55, 0, foundMat),
        );
      } else {
        const pileGeo = new THREE.CylinderGeometry(0.28, 0.32, 1.4, 8);
        for (const p of structPts) {
          const pile = new THREE.Mesh(pileGeo, foundMat);
          pile.position.set(p.x, 0.7, p.z);
          root.add(pile);
        }
        for (const e of edges) {
          if (e.len < 6) continue;
          const pile = new THREE.Mesh(pileGeo, foundMat);
          pile.position.set(e.mx, 0.7, e.mz);
          root.add(pile);
        }
      }
    }

    const deckPts = insetPoints(structPts, 0.88);

    for (let level = ring.fromLevel; level < ring.toLevel; level++) {
      const y0 = level * METRE_PER_STOREY;
      const yDeck = y0 + 0.04;

      root.add(makePolygonSlab(deckPts, floorThick, yDeck, floorMat, ring.hole && insetPoints(ring.hole, 1.05)));

      const colH = METRE_PER_STOREY - floorThick - 0.12;
      const colY = yDeck + floorThick + colH / 2;
      const colGeo = new THREE.BoxGeometry(colSize, colH, colSize);

      // Columns on vertices + along edges (follows parcel, not NS box).
      for (const p of structPts) {
        const col = new THREE.Mesh(colGeo, structMat);
        col.position.set(p.x, colY, p.z);
        root.add(col);
      }
      for (const e of edges) {
        const steps = Math.max(1, Math.floor(e.len / 5.5));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const col = new THREE.Mesh(colGeo, structMat);
          col.position.set(
            e.ax + (e.bx - e.ax) * t,
            colY,
            e.az + (e.bz - e.az) * t,
          );
          root.add(col);
        }
      }

      const beamYFloor = yDeck + floorThick + beamSize / 2;
      const beamYMid = colY;
      for (const e of edges) {
        const yaw = Math.atan2(e.bz - e.az, e.bx - e.ax);
        for (const y of [beamYFloor, beamYMid]) {
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry(e.len, beamSize, beamSize),
            beamMat,
          );
          beam.position.set(e.mx, y, e.mz);
          beam.rotation.y = -yaw;
          root.add(beam);
        }
      }

      if (steel) {
        for (const e of edges) {
          if (e.len < 5) continue;
          const span = Math.hypot(e.len * 0.92, colH);
          const angle = Math.atan2(colH, e.len * 0.92);
          const yaw = Math.atan2(e.bz - e.az, e.bx - e.ax);
          for (const dir of [1, -1] as const) {
            const brace = new THREE.Mesh(
              new THREE.BoxGeometry(span, 0.11, 0.11),
              braceMat,
            );
            brace.position.set(e.mx, colY, e.mz);
            brace.rotation.order = "YXZ";
            brace.rotation.y = -yaw;
            brace.rotation.z = dir * angle;
            root.add(brace);
          }
        }
      }

      const panelH = colH * 0.7;
      const panelY = yDeck + floorThick + 0.18 + panelH / 2;
      const outward = 0.06;

      for (const e of edges) {
        const dx = e.bx - e.ax;
        const dz = e.bz - e.az;
        const nx = -dz / e.len;
        const nz = dx / e.len;
        const yaw = -Math.atan2(dz, dx);
        // One facade bay per room on this storey, shared across edges by
        // length; min bay width 1.8 m, default rhythm without a room count.
        const bays =
          roomsPerStorey && ringPerimeter > 0
            ? Math.max(
                1,
                Math.min(
                  Math.floor(e.len / 1.8),
                  Math.round(roomsPerStorey * (e.len / ringPerimeter)),
                ),
              )
            : Math.max(2, Math.round(e.len / 3.4));

        for (let i = 0; i <= bays; i++) {
          const t = i / bays;
          const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, colH, 0.07),
            mullionMat,
          );
          mullion.position.set(
            e.ax + dx * t + nx * outward,
            colY,
            e.az + dz * t + nz * outward,
          );
          root.add(mullion);
        }

        if (c.facade === "curtain_wall") {
          for (let i = 0; i < bays; i += 2) {
            const t0 = (i + 0.12) / bays;
            const t1 = (i + 0.88) / bays;
            const x0 = e.ax + dx * t0;
            const z0 = e.az + dz * t0;
            const x1 = e.ax + dx * t1;
            const z1 = e.az + dz * t1;
            const pw = Math.hypot(x1 - x0, z1 - z0);
            const pane = new THREE.Mesh(
              new THREE.BoxGeometry(pw, panelH, 0.04),
              glassMat,
            );
            pane.position.set(
              (x0 + x1) / 2 + nx * (outward + 0.04),
              panelY,
              (z0 + z1) / 2 + nz * (outward + 0.04),
            );
            pane.rotation.y = yaw;
            pane.renderOrder = 3;
            root.add(pane);
          }
        } else {
          const plankMat = mat(timber ? COLOURS.timber : COLOURS.concrete, {
            transparent: true,
            opacity: 0.5,
            roughness: 0.85,
          });
          for (let i = 0; i < bays; i += 2) {
            const t0 = (i + 0.2) / bays;
            const t1 = (i + 0.55) / bays;
            const x0 = e.ax + dx * t0;
            const z0 = e.az + dz * t0;
            const x1 = e.ax + dx * t1;
            const z1 = e.az + dz * t1;
            const pw = Math.hypot(x1 - x0, z1 - z0);
            const plank = new THREE.Mesh(
              new THREE.BoxGeometry(pw, panelH * 0.85, 0.06),
              plankMat,
            );
            plank.position.set(
              (x0 + x1) / 2 + nx * (outward + 0.06),
              panelY,
              (z0 + z1) / 2 + nz * (outward + 0.06),
            );
            plank.rotation.y = yaw;
            root.add(plank);
          }
        }
      }
    }

    if (c.energy === "heat_pump" && ring.toLevel === maxTo) {
      const roofY = ring.toLevel * METRE_PER_STOREY + 0.25;
      const unitMat = mat(0xc5cad0, { metalness: 0.35, roughness: 0.45 });
      for (let i = 0; i < 2; i++) {
        const unit = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.7, 0.9),
          unitMat,
        );
        unit.position.set(cx - 1.1 + i * 2.2, roofY, cz);
        root.add(unit);
      }
    }
  }

  root.userData.dispose = () => {
    disposeObject(root);
    ghostLine.dispose();
  };
  return root;
}

/** Local metres: X east, Z south (MapLibre getMatrixForModel convention). */
export function lngLatToLocalMetres(
  lng: number,
  lat: number,
  originLng: number,
  originLat: number,
): { x: number; z: number } {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((originLat * Math.PI) / 180);
  return {
    x: (lng - originLng) * mPerDegLng,
    z: (originLat - lat) * mPerDegLat,
  };
}

export function polygonCentroid(
  ring: GeoJSON.Position[],
): { lng: number; lat: number } {
  const pts =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lng, lat };
}
