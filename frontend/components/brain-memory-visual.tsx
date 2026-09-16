"use client";

import { useEffect, useMemo, useRef } from "react";

type BrainMemoryVisualProps = {
  memoryCount: number;
  signal: number;
};

type BrainNode = { x: number; y: number; energy: number };
type BrainEdge = { from: number; to: number; strength: number };

function hash(index: number) {
  const value = Math.sin(index * 91.73) * 43758.5453;
  return value - Math.floor(value);
}

export function BrainMemoryVisual({ memoryCount, signal }: BrainMemoryVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });
  const pulseStartedAt = useRef(0);
  const nodes = useMemo<BrainNode[]>(() => {
    const next: BrainNode[] = [];
    const nodeCount = Math.min(82, 52 + Math.min(memoryCount, 15) * 2);

    for (let index = 0; index < nodeCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const y = -0.84 + (row / Math.max(1, Math.ceil(nodeCount / 2) - 1)) * 1.68;
      const hemisphereWidth = Math.sqrt(Math.max(0.08, 1 - y * y)) * 0.43;
      const x = side * (0.07 + hemisphereWidth * (0.18 + hash(index + 7) * 0.78));
      next.push({ x, y: y + (hash(index + 18) - 0.5) * 0.05, energy: 0.35 + hash(index + 29) * 0.65 });
    }

    return next;
  }, [memoryCount]);

  const edges = useMemo<BrainEdge[]>(() => {
    const next: BrainEdge[] = [];
    for (let from = 0; from < nodes.length; from += 1) {
      for (let to = from + 1; to < nodes.length; to += 1) {
        const dx = nodes[from].x - nodes[to].x;
        const dy = nodes[from].y - nodes[to].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const sameHemisphere = Math.sign(nodes[from].x) === Math.sign(nodes[to].x);
        if ((sameHemisphere && distance < 0.23) || (!sameHemisphere && distance < 0.19)) {
          next.push({ from, to, strength: 0.35 + hash(from * 17 + to) * 0.65 });
        }
      }
    }
    return next.slice(0, 190);
  }, [nodes]);

  useEffect(() => {
    pulseStartedAt.current = performance.now();
  }, [signal]);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let reducedMotion = false;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function cssColor(name: string, fallback: string) {
      return getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
    }

    function draw(now: number) {
      if (!width || !height) resize();
      const accent = cssColor("--chat-accent", "#e67d2b");
      const foreground = cssColor("--chat-foreground", "#f2f1e8");
      const border = cssColor("--chat-border", "rgba(255,255,255,.14)");
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width / 1.95, height / 2.15);
      const pulseProgress = Math.min(1, Math.max(0, (now - pulseStartedAt.current) / 1400));
      const pulseWave = reducedMotion ? 0.5 : pulseProgress < 1 ? pulseProgress : (now / 2800) % 1;

      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(cx, cy);

      const glow = context.createRadialGradient(0, -scale * 0.08, scale * 0.04, 0, 0, scale * 0.78);
      glow.addColorStop(0, `${accent}20`);
      glow.addColorStop(1, `${accent}00`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, scale * 0.76, 0, Math.PI * 2);
      context.fill();

      context.lineWidth = 1;
      context.strokeStyle = `${border}`;
      context.globalAlpha = 0.75;
      context.beginPath();
      context.moveTo(-scale * 0.02, -scale * 0.76);
      context.bezierCurveTo(-scale * 0.42, -scale * 0.89, -scale * 0.66, -scale * 0.52, -scale * 0.56, -scale * 0.12);
      context.bezierCurveTo(-scale * 0.68, scale * 0.25, -scale * 0.43, scale * 0.7, -scale * 0.03, scale * 0.76);
      context.moveTo(scale * 0.02, -scale * 0.76);
      context.bezierCurveTo(scale * 0.42, -scale * 0.89, scale * 0.66, -scale * 0.52, scale * 0.56, -scale * 0.12);
      context.bezierCurveTo(scale * 0.68, scale * 0.25, scale * 0.43, scale * 0.7, scale * 0.03, scale * 0.76);
      context.stroke();

      context.setLineDash([scale * 0.018, scale * 0.028]);
      context.globalAlpha = 0.34;
      context.beginPath();
      context.moveTo(0, -scale * 0.75);
      context.lineTo(0, scale * 0.75);
      context.stroke();
      context.setLineDash([]);

      edges.forEach((edge, edgeIndex) => {
        const from = nodes[edge.from];
        const to = nodes[edge.to];
        const x1 = from.x * scale;
        const y1 = from.y * scale;
        const x2 = to.x * scale;
        const y2 = to.y * scale;
        const active = Math.abs(((pulseWave * 1.7 + edgeIndex / edges.length) % 1) - 0.5) < 0.055;
        context.globalAlpha = 0.08 + edge.strength * 0.16 + (active ? 0.3 : 0);
        context.strokeStyle = active ? accent : foreground;
        context.lineWidth = active ? 1.5 : 0.8;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();

        if (active) {
          const progress = (pulseWave * 1.7 + edgeIndex / edges.length) % 1;
          const dotX = x1 + (x2 - x1) * progress;
          const dotY = y1 + (y2 - y1) * progress;
          context.globalAlpha = 0.9;
          context.fillStyle = accent;
          context.beginPath();
          context.arc(dotX, dotY, scale * 0.014, 0, Math.PI * 2);
          context.fill();
        }
      });

      nodes.forEach((node, index) => {
        const x = node.x * scale;
        const y = node.y * scale;
        const pointerDistance = Math.hypot(pointerRef.current.x * width - (cx + x), pointerRef.current.y * height - (cy + y));
        const focused = pointerRef.current.active && pointerDistance < scale * 0.13;
        const flicker = reducedMotion ? 0 : Math.sin(now / 500 + index) * 0.12;
        const radius = scale * (focused ? 0.025 : 0.014 + node.energy * 0.008);
        context.globalAlpha = Math.max(0.3, 0.56 + flicker + (focused ? 0.3 : 0));
        context.fillStyle = focused || index % 7 === 0 ? accent : foreground;
        context.shadowColor = accent;
        context.shadowBlur = focused ? scale * 0.08 : scale * 0.025;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      });

      context.restore();
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    }

    function updateMotionPreference() {
      reducedMotion = mediaQuery.matches;
      if (reducedMotion) {
        cancelAnimationFrame(frame);
        draw(performance.now());
      } else {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    mediaQuery.addEventListener("change", updateMotionPreference);
    resize();
    updateMotionPreference();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mediaQuery.removeEventListener("change", updateMotionPreference);
    };
  }, [edges, nodes]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-full w-full touch-none"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height,
          active: true,
        };
      }}
      onPointerLeave={() => {
        pointerRef.current.active = false;
      }}
    />
  );
}
