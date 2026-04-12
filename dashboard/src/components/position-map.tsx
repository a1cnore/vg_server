"use client";

import { useRef, useEffect, useCallback } from "react";

interface MapPlayer {
  handle: string | null;
  team: number | null;
  posX: number;
  posY: number;
  entityId: number | null;
}

const X_MIN = -90;
const X_MAX = 90;
const Y_MIN = -15;
const Y_MAX = 20;

const CYAN = "#22d3ee";
const RED = "#ef4444";
const GRID_COLOR = "#1a1a1a";
const BG = "#0a0a0a";

interface LerpState {
  [key: number]: { x: number; y: number };
}

export function PositionMap({ players }: { players: MapPlayer[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lerpRef = useRef<LerpState>({});
  const playersRef = useRef(players);
  const rafRef = useRef<number>(0);

  playersRef.current = players;

  const worldToCanvas = useCallback(
    (wx: number, wy: number, cw: number, ch: number) => {
      const x = ((wx - X_MIN) / (X_MAX - X_MIN)) * cw;
      const y = ((Y_MAX - wy) / (Y_MAX - Y_MIN)) * ch;
      return { x, y };
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const dpr = devicePixelRatio;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cw, ch);

      // Grid lines
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      for (let gx = X_MIN; gx <= X_MAX; gx += 30) {
        const { x } = worldToCanvas(gx, 0, cw, ch);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      }
      for (let gy = Y_MIN; gy <= Y_MAX; gy += 5) {
        const { y } = worldToCanvas(0, gy, cw, ch);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();
      }

      // Lane center line (y=0)
      const { y: centerY } = worldToCanvas(0, 0, cw, ch);
      ctx.strokeStyle = "#2a2a2a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(cw, centerY);
      ctx.stroke();

      // Update lerp positions and draw players
      const current = playersRef.current;
      const lerp = lerpRef.current;
      for (const p of current) {
        const eid = p.entityId ?? p.handle?.charCodeAt(0) ?? 0;

        if (!lerp[eid]) {
          lerp[eid] = { x: p.posX, y: p.posY };
        } else {
          lerp[eid].x += (p.posX - lerp[eid].x) * 0.15;
          lerp[eid].y += (p.posY - lerp[eid].y) * 0.15;
        }

        const lp = lerp[eid];
        const color = p.team === 1 ? CYAN : RED;
        const { x, y } = worldToCanvas(lp.x, lp.y, cw, ch);
        const r = 4 * dpr;

        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 * dpr;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        const label = p.handle ?? `E${eid}`;
        ctx.font = `${10 * dpr}px sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.fillText(label, x, y - r - 3 * dpr);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [worldToCanvas]);

  return (
    <div
      ref={containerRef}
      className="w-full h-48 border border-border rounded-md overflow-hidden"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
