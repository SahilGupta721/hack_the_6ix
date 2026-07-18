"use client";

import { useEffect, useRef } from "react";
import type { Application, Graphics, Ticker } from "pixi.js";

export interface PixelViewportProps {
  hourlyKw: number[];
  peakKw: number;
  occupancy: number;
  strainClass: "STABLE" | "ELEVATED" | "CRITICAL";
  rooms: number;
  colour: string;
}

const VIEW_W = 360;
const VIEW_H = 200;
const TILE_W = 28;
const TILE_H = 14;
const GRID_HALF = 3;
const BLOCK_HW = 20;
const BLOCK_HH = 10;
const BLOCK_H = 13;
const HOUR_MS = 700;

const STRAIN_COLOURS: Record<PixelViewportProps["strainClass"], number> = {
  STABLE: 0x35c28f,
  ELEVATED: 0xf5a623,
  CRITICAL: 0xe5484d,
};

const GUEST_PALETTE = [0xd97b4f, 0x7fb069, 0x5b8bd9, 0xe3b23c, 0xc85a89];

interface GuestSprite {
  view: Graphics;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  period: number;
  phase: number;
}

function frac(n: number): number {
  return n - Math.floor(n);
}

/** Deterministic pseudo-random in [0, 1) derived from index math (no Math.random). */
function seeded(index: number, salt: number): number {
  return frac(Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Multiply a #rrggbb string by a factor and return a packed RGB number. */
function shade(hex: string, factor: number): number {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const num = Number.parseInt(full, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((num & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function hourLabel(index: number): string {
  const day = index < 24 ? "Sat" : "Sun";
  const hour = String(index % 24).padStart(2, "0");
  return `${day} ${hour}:00`;
}

function buildingLevels(rooms: number): number {
  if (rooms <= 12) return 2;
  if (rooms <= 80) return 4;
  return 7;
}

export function PixelViewport({
  hourlyKw,
  peakKw,
  occupancy,
  strainClass,
  rooms,
  colour,
}: PixelViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    void (async () => {
      const { Application, Container, Graphics, Text } = await import("pixi.js");
      if (disposed) return;

      const app = new Application();
      await app.init({
        width: VIEW_W,
        height: VIEW_H,
        background: 0x161426,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true, { children: true, texture: true });
        return;
      }
      appRef.current = app;
      host.appendChild(app.canvas);

      const scene = new Container();
      scene.position.set(VIEW_W / 2, 118);
      app.stage.addChild(scene);

      // Isometric ground: checkered diamond tiles in warm sand tones.
      const ground = new Graphics();
      for (let gx = -GRID_HALF; gx <= GRID_HALF; gx++) {
        for (let gy = -GRID_HALF; gy <= GRID_HALF; gy++) {
          const x = (gx - gy) * (TILE_W / 2);
          const y = (gx + gy) * (TILE_H / 2);
          const light = (gx + gy) % 2 === 0;
          ground
            .poly([
              x,
              y - TILE_H / 2,
              x + TILE_W / 2,
              y,
              x,
              y + TILE_H / 2,
              x - TILE_W / 2,
              y,
            ])
            .fill(light ? 0xb3894f : 0xa07642)
            .stroke({ width: 1, color: 0x77572c, alpha: 0.55 });
        }
      }
      scene.addChild(ground);

      // Strain glow under and behind the building.
      const glow = new Graphics();
      scene.addChild(glow);
      const glowColour = STRAIN_COLOURS[strainClass];
      const levels = buildingLevels(rooms);
      const buildingTopY = -levels * BLOCK_H;
      const redrawGlow = (fraction: number): void => {
        const a = 0.1 + 0.32 * clamp01(fraction);
        glow.clear();
        glow
          .ellipse(0, buildingTopY / 2, 52, levels * BLOCK_H * 0.9)
          .fill({ color: glowColour, alpha: a * 0.3 });
        glow.ellipse(0, 3, 58, 26).fill({ color: glowColour, alpha: a * 0.35 });
        glow.ellipse(0, 3, 40, 18).fill({ color: glowColour, alpha: a * 0.55 });
        glow.ellipse(0, 3, 26, 12).fill({ color: glowColour, alpha: a });
      };

      const guestsBack = new Container();
      scene.addChild(guestsBack);

      // Building: stacked isometric blocks, height scaled to room count.
      const building = new Container();
      scene.addChild(building);
      const body = new Graphics();
      for (let k = 0; k < levels; k++) {
        const y0 = -k * BLOCK_H;
        body
          .poly([
            -BLOCK_HW,
            y0 - BLOCK_H,
            0,
            y0 - BLOCK_H + BLOCK_HH,
            0,
            y0 + BLOCK_HH,
            -BLOCK_HW,
            y0,
          ])
          .fill(shade(colour, 0.62));
        body
          .poly([
            BLOCK_HW,
            y0 - BLOCK_H,
            0,
            y0 - BLOCK_H + BLOCK_HH,
            0,
            y0 + BLOCK_HH,
            BLOCK_HW,
            y0,
          ])
          .fill(shade(colour, 0.42));
        body
          .poly([
            0,
            y0 - BLOCK_H - BLOCK_HH,
            BLOCK_HW,
            y0 - BLOCK_H,
            0,
            y0 - BLOCK_H + BLOCK_HH,
            -BLOCK_HW,
            y0 - BLOCK_H,
          ])
          .fill(shade(colour, 0.95));
      }
      // Small roof cap.
      const capHW = 8;
      const capHH = 4;
      const capH = 5;
      body
        .poly([
          -capHW,
          buildingTopY - capH,
          0,
          buildingTopY - capH + capHH,
          0,
          buildingTopY + capHH,
          -capHW,
          buildingTopY,
        ])
        .fill(shade(colour, 0.75));
      body
        .poly([
          capHW,
          buildingTopY - capH,
          0,
          buildingTopY - capH + capHH,
          0,
          buildingTopY + capHH,
          capHW,
          buildingTopY,
        ])
        .fill(shade(colour, 0.5));
      body
        .poly([
          0,
          buildingTopY - capH - capHH,
          capHW,
          buildingTopY - capH,
          0,
          buildingTopY - capH + capHH,
          -capHW,
          buildingTopY - capH,
        ])
        .fill(shade(colour, 1.15));
      building.addChild(body);

      // Window slots on the left and right faces of every block.
      const windowSpots: { x: number; y: number; order: number }[] = [];
      let windowIndex = 0;
      for (let k = 0; k < levels; k++) {
        const y0 = -k * BLOCK_H;
        for (const t of [0.3, 0.65]) {
          windowSpots.push({
            x: -BLOCK_HW * (1 - t) - 1.5,
            y: y0 - BLOCK_H + t * BLOCK_HH + 3,
            order: seeded(windowIndex++, 9),
          });
          windowSpots.push({
            x: BLOCK_HW * (1 - t) - 1.5,
            y: y0 - BLOCK_H + t * BLOCK_HH + 3,
            order: seeded(windowIndex++, 9),
          });
        }
      }
      const litOrder = windowSpots
        .map((spot, i) => ({ spot, key: spot.order + i * 1e-4 }))
        .sort((a, b) => a.key - b.key)
        .map((entry) => entry.spot);
      const windows = new Graphics();
      building.addChild(windows);
      const redrawWindows = (fraction: number): void => {
        const lit = Math.round(litOrder.length * clamp01(fraction));
        windows.clear();
        litOrder.forEach((spot, rank) => {
          if (rank < lit) {
            windows
              .rect(spot.x - 1, spot.y - 1, 5, 7)
              .fill({ color: 0xffc966, alpha: 0.3 });
            windows.rect(spot.x, spot.y, 3, 5).fill(0xffd98c);
          } else {
            windows.rect(spot.x, spot.y, 3, 5).fill(0x232838);
          }
        });
      };

      const guestsFront = new Container();
      scene.addChild(guestsFront);

      // Guests: deterministic spawn ring, all walking toward the entrance.
      const guestCount = Math.round(6 + 14 * occupancy);
      const guests: GuestSprite[] = [];
      for (let i = 0; i < guestCount; i++) {
        const angle = seeded(i, 1) * Math.PI * 2;
        const radius = 80 + seeded(i, 2) * 45;
        const sx = Math.cos(angle) * radius;
        const sy = Math.sin(angle) * radius * 0.5;
        const tx = (seeded(i, 3) - 0.5) * 34;
        const ty = 16 + seeded(i, 4) * 12;
        const period = 6 + seeded(i, 5) * 7;
        const phase = seeded(i, 6);
        const view = new Graphics();
        view.rect(-1, -5, 3, 3).fill(0xf2d3a7);
        view
          .rect(-1, -2, 3, 4)
          .fill(GUEST_PALETTE[i % GUEST_PALETTE.length] ?? 0xd97b4f);
        (sy < 4 ? guestsBack : guestsFront).addChild(view);
        guests.push({ view, sx, sy, tx, ty, period, phase });
      }

      // HUD: current simulated hour and load.
      const hud = new Text({
        text: "",
        style: {
          fontFamily: "monospace",
          fontSize: 10,
          fill: 0xffffff,
          letterSpacing: 0.5,
        },
      });
      hud.position.set(8, 6);
      app.stage.addChild(hud);

      const hours = hourlyKw.length > 0 ? hourlyKw : [0];
      const applyHour = (index: number): void => {
        const kw = hours[index % hours.length] ?? 0;
        const fraction = peakKw > 0 ? clamp01(kw / peakKw) : 0;
        redrawWindows(fraction);
        redrawGlow(fraction);
        hud.text = `${hourLabel(index % 48)}, ${Math.round(kw)} kW`;
      };

      let elapsedS = 0;
      let hourAcc = 0;
      let hourIdx = 0;
      applyHour(0);

      const tick = (ticker: Ticker): void => {
        elapsedS += ticker.deltaMS / 1000;
        hourAcc += ticker.deltaMS;
        while (hourAcc >= HOUR_MS) {
          hourAcc -= HOUR_MS;
          hourIdx = (hourIdx + 1) % hours.length;
          applyHour(hourIdx);
        }
        glow.alpha = 0.82 + 0.18 * Math.sin(elapsedS * 2.4);
        for (const guest of guests) {
          const p = frac(elapsedS / guest.period + guest.phase);
          const x = guest.sx + (guest.tx - guest.sx) * p;
          const y = guest.sy + (guest.ty - guest.sy) * p;
          const step = Math.floor(elapsedS * 6 + guest.phase * 10) % 2;
          guest.view.position.set(Math.round(x), Math.round(y) - step);
          guest.view.alpha = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;
        }
      };
      app.ticker.add(tick);
    })();

    return () => {
      disposed = true;
      const app = appRef.current;
      appRef.current = null;
      if (app) {
        try {
          // Stop the ticker first: a queued frame running into a destroyed
          // renderer crashes React with it, which must never happen mid-demo.
          app.ticker.stop();
          app.destroy(true, { children: true, texture: true });
        } catch {
          // Pixi teardown failures stay contained to the viewport.
        }
      }
    };
  }, [hourlyKw, peakKw, occupancy, strainClass, rooms, colour]);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-md border border-white/10"
      style={{ width: VIEW_W, height: VIEW_H }}
    />
  );
}
