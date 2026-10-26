"use client";

import { useEffect, useRef } from "react";

type Star = {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  magnitude: number; // inherent brightness, varies per star like real star magnitude
  twinklePhase: number;
  twinkleSpeed: number;
  influence: number; // eased 0..1 cursor-proximity boost
  neighbors: number[]; // nearest-star indices, candidate constellation edges
};

const STAR_COUNT = 150;
const MIN_DIST = 46; // px — rejection-sampled spacing so stars scatter organically, not on a grid
const NEIGHBORS_PER_STAR = 3;

const RADIUS = 260; // cursor influence radius for the trampoline pull
const MAX_PULL = 46;
const STIFF = 0.16;
const DAMP = 0.8;

function falloff(d: number) {
  if (d >= RADIUS) return 0;
  const t = 1 - d / RADIUS;
  return t * t * (3 - 2 * t);
}

export default function StarConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, has: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let W = 0;
    let H = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    function buildStars() {
      const stars: Star[] = [];
      let attempts = 0;
      while (stars.length < STAR_COUNT && attempts < STAR_COUNT * 40) {
        attempts++;
        const x = Math.random() * W;
        const y = Math.random() * H;
        let ok = true;
        for (let i = 0; i < stars.length; i++) {
          const dx = stars[i].baseX - x;
          const dy = stars[i].baseY - y;
          if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        // magnitude skewed toward dim, with occasional bright "anchor" stars
        const magnitude = 0.22 + Math.pow(Math.random(), 2.3) * 0.78;
        stars.push({
          baseX: x,
          baseY: y,
          x,
          y,
          vx: 0,
          vy: 0,
          magnitude,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.4 + Math.random() * 0.9,
          influence: 0,
          neighbors: [],
        });
      }

      // nearest-neighbor edges computed once from rest positions
      for (let i = 0; i < stars.length; i++) {
        const dists: { j: number; d: number }[] = [];
        for (let j = 0; j < stars.length; j++) {
          if (i === j) continue;
          const dx = stars[i].baseX - stars[j].baseX;
          const dy = stars[i].baseY - stars[j].baseY;
          dists.push({ j, d: dx * dx + dy * dy });
        }
        dists.sort((a, b) => a.d - b.d);
        stars[i].neighbors = dists.slice(0, NEIGHBORS_PER_STAR).map((d) => d.j);
      }

      starsRef.current = stars;
    }

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * DPR;
      canvas!.height = H * DPR;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildStars();
    }

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY, has: true };
    }
    function handleMouseOut(e: MouseEvent) {
      if (!e.relatedTarget) mouseRef.current.has = false;
    }

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseout", handleMouseOut);

    let raf = 0;
    const t0 = performance.now();
    const brightCache: number[] = [];

    function frame(now: number) {
      const t = (now - t0) / 1000;
      const mouse = mouseRef.current;
      const stars = starsRef.current;

      // trampoline spring physics
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const dx = mouse.x - s.baseX;
        const dy = mouse.y - s.baseY;
        const dist = Math.hypot(dx, dy);
        const infl = mouse.has ? falloff(dist) : 0;
        s.influence += (infl - s.influence) * 0.16;

        let targetX = s.baseX;
        let targetY = s.baseY;
        if (dist > 0.001) {
          targetX = s.baseX + (dx / dist) * infl * MAX_PULL;
          targetY = s.baseY + (dy / dist) * infl * MAX_PULL;
        }
        const ax = (targetX - s.x) * STIFF;
        const ay = (targetY - s.y) * STIFF;
        s.vx = (s.vx + ax) * DAMP;
        s.vy = (s.vy + ay) * DAMP;
        s.x += s.vx;
        s.y += s.vy;
      }

      ctx!.clearRect(0, 0, W, H);

      // brightness: visible-but-uneven baseline ("some shine brighter, some don't"),
      // with a strong lift near the cursor ("much much brighter")
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twinkle = 0.6 + 0.4 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        const naturalOp = 0.16 + s.magnitude * twinkle * 0.42;
        const liftOp = s.influence * 0.62;
        brightCache[i] = Math.min(1, naturalOp + liftOp);
      }

      // constellation lines only appear between neighbor pairs that are both shining
      ctx!.lineWidth = 1;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        for (const j of s.neighbors) {
          const shared = Math.min(brightCache[i], brightCache[j]);
          if (shared < 0.34) continue;
          const op = Math.min(0.8, (shared - 0.34) * 1.35);
          ctx!.strokeStyle = `rgba(244,246,250,${op.toFixed(3)})`;
          ctx!.beginPath();
          ctx!.moveTo(s.x, s.y);
          ctx!.lineTo(stars[j].x, stars[j].y);
          ctx!.stroke();
        }
      }

      // stars
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const op = brightCache[i];
        const rad = 1.1 + op * 2.3;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, rad, 0, Math.PI * 2);
        if (s.influence > 0.04) {
          ctx!.shadowColor = `rgba(244,246,250,${Math.min(1, s.influence * 1.4).toFixed(3)})`;
          ctx!.shadowBlur = 14 * s.influence;
        } else {
          ctx!.shadowBlur = 0;
        }
        ctx!.fillStyle = `rgba(244,246,250,${op.toFixed(3)})`;
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;

      raf = requestAnimationFrame(frame);
    }

    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
