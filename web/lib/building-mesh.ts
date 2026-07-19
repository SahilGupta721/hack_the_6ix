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
  fromLevel: number;
  toLevel: number;
}

export interface MeshBuildingSpec {
  structure: Structure;
  floors: number;
  shapeId?: ShapeId;
  components: BuildComponents;
}

const COLOURS = {
  timber: 0xc4783a,
  steel: 0x7d93a8,
  steelDark: 0x4a5c6e,
  concrete: 0x9aa5b1,
  concreteDark: 0x6e7680,
  massTimber: 0xd97e3f,
  glass: 0x88c8e8,
  rainscreen: 0xb8a089,
  foundation: 0x7a8088,
};

function disposeObject(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    geos.add(obj.geometry);
    const m = obj.material;
    if (Array.isArray(m)) m.forEach((x) => mats.add(x));
    else mats.add(m);
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
  },
) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    metalness: opts?.metalness ?? 0.15,
    roughness: opts?.roughness ?? 0.75,
  });
}

/** Horizontal slab matching the parcel polygon (not an AABB). */
function makeFootprintSlab(
  points: Array<{ x: number; z: number }>,
  thickness: number,
  yBottom: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].z);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  // Shape XY (east, south) + extrude Z → rotate so thickness is +Y up.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness + yBottom, 0);

  return new THREE.Mesh(geo, material);
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
    if (len < 0.5) continue;
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

/**
 * Procedural low-poly construction kit: floors, columns, braces, facade,
 * foundation — swaps with BuildComponents.
 */
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

  const colMat = mat(timber ? COLOURS.timber : COLOURS.steel, {
    metalness: steel ? 0.55 : 0.05,
    roughness: steel ? 0.35 : 0.85,
  });
  const floorMat = mat(floorTimber ? COLOURS.massTimber : COLOURS.concrete, {
    roughness: floorTimber ? 0.9 : 0.7,
  });
  const braceMat = mat(COLOURS.steelDark, { metalness: 0.6, roughness: 0.3 });
  const glassMat = mat(COLOURS.glass, {
    transparent: true,
    opacity: 0.45,
    metalness: 0.2,
    roughness: 0.15,
  });
  const rainMat = mat(COLOURS.rainscreen, { roughness: 0.85 });
  const foundMat = mat(COLOURS.foundation, { roughness: 0.9 });
  const pileMat = mat(COLOURS.concreteDark, { roughness: 0.8 });

  const colSize = timber ? 0.55 : 0.32;
  const floorThick = floorTimber ? 0.45 : 0.32;
  const maxTo = Math.max(...rings.map((r) => r.toLevel), 1);

  for (const ring of rings) {
    if (ring.points.length < 3) continue;
    const edges = edgePoints(ring.points);
    if (edges.length === 0) continue;

    if (ring.fromLevel === 0) {
      if (c.foundation === "reinforced_concrete") {
        root.add(makeFootprintSlab(ring.points, 0.7, 0, foundMat));
      } else {
        const pileGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.6, 8);
        for (const p of ring.points) {
          const pile = new THREE.Mesh(pileGeo, pileMat);
          pile.position.set(p.x, 0.8, p.z);
          root.add(pile);
        }
        for (const e of edges) {
          const pile = new THREE.Mesh(pileGeo, pileMat);
          pile.position.set(e.mx, 0.8, e.mz);
          root.add(pile);
        }
      }
    }

    for (let level = ring.fromLevel; level < ring.toLevel; level++) {
      const y0 = level * METRE_PER_STOREY;
      const y1 = (level + 1) * METRE_PER_STOREY;

      root.add(makeFootprintSlab(ring.points, floorThick, y0, floorMat));

      if (level === ring.toLevel - 1) {
        root.add(
          makeFootprintSlab(ring.points, floorThick * 0.7, y1 - floorThick * 0.7, floorMat),
        );
      }

      const colH = METRE_PER_STOREY - floorThick;
      const colY = y0 + floorThick + colH / 2;
      const colGeo = new THREE.BoxGeometry(colSize, colH, colSize);

      // Columns at vertices + edge midpoints (follows real footprint).
      for (const p of ring.points) {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(p.x, colY, p.z);
        root.add(col);
      }
      for (const e of edges) {
        if (e.len < 8) continue;
        const steps = Math.max(1, Math.floor(e.len / 6));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const col = new THREE.Mesh(colGeo, colMat);
          col.position.set(
            e.ax + (e.bx - e.ax) * t,
            colY,
            e.az + (e.bz - e.az) * t,
          );
          root.add(col);
        }
      }

      if (steel) {
        const braceH = colH;
        const braceT = 0.12;
        const midY = colY;
        for (const e of edges) {
          if (e.len < 4) continue;
          const span = Math.hypot(e.len, braceH);
          const angle = Math.atan2(braceH, e.len);
          const yaw = Math.atan2(e.bz - e.az, e.bx - e.ax);
          for (const dir of [1, -1] as const) {
            const brace = new THREE.Mesh(
              new THREE.BoxGeometry(span, braceT, braceT),
              braceMat,
            );
            brace.position.set(e.mx, midY, e.mz);
            brace.rotation.order = "YXZ";
            brace.rotation.y = -yaw;
            brace.rotation.z = dir * angle;
            root.add(brace);
          }
        }
      }

      const facadeMat = c.facade === "curtain_wall" ? glassMat : rainMat;
      const panelH = colH - 0.25;
      const panelY = y0 + floorThick + 0.12 + panelH / 2;
      const outward = c.facade === "curtain_wall" ? 0.12 : 0.22;

      for (const e of edges) {
        const dx = e.bx - e.ax;
        const dz = e.bz - e.az;
        const nx = -dz / e.len;
        const nz = dx / e.len;
        const bays = Math.max(1, Math.round(e.len / 3.2));
        for (let b = 0; b < bays; b++) {
          const t0 = (b + 0.08) / bays;
          const t1 = (b + 0.92) / bays;
          const x0 = e.ax + dx * t0;
          const z0 = e.az + dz * t0;
          const x1 = e.ax + dx * t1;
          const z1 = e.az + dz * t1;
          const pw = Math.hypot(x1 - x0, z1 - z0);
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(pw, panelH, 0.08),
            facadeMat,
          );
          panel.position.set(
            (x0 + x1) / 2 + nx * outward,
            panelY,
            (z0 + z1) / 2 + nz * outward,
          );
          panel.rotation.y = -Math.atan2(dz, dx);
          root.add(panel);
        }
      }
    }

    if (c.energy === "heat_pump" && ring.toLevel === maxTo) {
      const roofY = ring.toLevel * METRE_PER_STOREY + 0.35;
      const unitMat = mat(0xd0d4d8, { metalness: 0.4, roughness: 0.4 });
      const cx = ring.points.reduce((s, p) => s + p.x, 0) / ring.points.length;
      const cz = ring.points.reduce((s, p) => s + p.z, 0) / ring.points.length;
      for (let i = 0; i < 3; i++) {
        const unit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.1), unitMat);
        unit.position.set(cx - 2 + i * 2, roofY, cz);
        root.add(unit);
      }
    }
  }

  root.userData.dispose = () => disposeObject(root);
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
