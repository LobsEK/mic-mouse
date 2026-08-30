"use client";

import { useEffect, useRef } from "react";

export type OrbState = "idle" | "thinking" | "working" | "alert";

/**
 * Apollo as a character, not an icon: an orange sphere with two eyes that
 * actually look at things. The eyes follow the cursor when idle, sweep while
 * agents are running, dart around while Apollo is thinking, and narrow when
 * something needs attention — so a glance at the orb tells you what it is doing.
 */
export default function ApolloOrb({
  size = 64,
  state = "idle",
  follow = true,
}: {
  size?: number;
  state?: OrbState;
  follow?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const rightRef = useRef<HTMLSpanElement>(null);

  // proportions taken from the reference sphere
  const eyeW = size * 0.118;
  const eyeH = size * 0.205;
  const gap = size * 0.052;
  const maxX = size * 0.105;
  const maxY = size * 0.07;

  // Keep the animation loop reading the latest props without restarting it.
  const stateRef = useRef(state);
  const followRef = useRef(follow);
  useEffect(() => {
    stateRef.current = state;
    followRef.current = follow;
  }, [state, follow]);

  useEffect(() => {
    const pointer = { x: 0, y: 0, seen: false };
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let rect: DOMRect | null = null;
    let raf = 0;
    let rectTimer = 0;

    // blink + idle-glance timing
    let nextBlink = performance.now() + 2200 + Math.random() * 2600;
    let blinkUntil = 0;
    let nextGlance = performance.now() + 900;
    const glance = { x: 0, y: 0 };

    const readRect = () => {
      rect = rootRef.current?.getBoundingClientRect() ?? null;
    };
    readRect();
    rectTimer = window.setInterval(readRect, 700);

    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.seen = true;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", readRect, { passive: true });
    window.addEventListener("resize", readRect);

    const frame = (t: number) => {
      const st = stateRef.current;

      if (st === "working") {
        // scanning left and right: visibly "at work"
        target.x = Math.sin(t / 620) * maxX;
        target.y = Math.sin(t / 1450) * (maxY * 0.4);
      } else if (st === "thinking") {
        // darting glances, the way eyes move while someone thinks
        if (t > nextGlance) {
          glance.x = (Math.random() * 2 - 1) * maxX;
          glance.y = (Math.random() * 2 - 1) * maxY;
          nextGlance = t + 380 + Math.random() * 520;
        }
        target.x = glance.x;
        target.y = glance.y;
      } else if (followRef.current && pointer.seen && rect) {
        // looking straight at the cursor
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        // saturates over ~320px, so nearby movement reads as attention
        const pull = Math.min(1, dist / 320);
        target.x = (dx / dist) * maxX * pull;
        target.y = (dy / dist) * maxY * pull;
      } else {
        target.x = 0;
        target.y = 0;
      }

      cur.x += (target.x - cur.x) * 0.14;
      cur.y += (target.y - cur.y) * 0.14;
      if (eyesRef.current) {
        eyesRef.current.style.transform = `translate(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px)`;
      }

      if (t > nextBlink) {
        blinkUntil = t + 110;
        nextBlink = t + 2400 + Math.random() * 3200;
      }
      const blinking = t < blinkUntil;
      const squish = blinking ? 0.08 : st === "alert" ? 0.55 : 1;
      const eyeTransform = `scaleY(${squish})`;
      if (leftRef.current) leftRef.current.style.transform = eyeTransform;
      if (rightRef.current) rightRef.current.style.transform = eyeTransform;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(rectTimer);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", readRect);
      window.removeEventListener("resize", readRect);
    };
  }, [maxX, maxY]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "relative",
        flex: "none",
        background:
          "radial-gradient(circle at 32% 26%, #ffa257 0%, #fb8b3a 38%, #f0761f 68%, #d95f10 100%)",
        boxShadow:
          `inset 0 ${size * 0.03}px ${size * 0.07}px rgba(255,214,170,.55),` +
          `inset 0 -${size * 0.05}px ${size * 0.1}px rgba(150,52,0,.34),` +
          `0 ${size * 0.06}px ${size * 0.18}px -${size * 0.05}px rgba(217,95,16,.55)`,
        display: "grid",
        placeItems: "center",
        transition: "filter .2s ease",
        filter: state === "alert" ? "saturate(1.15)" : undefined,
      }}
    >
      <div
        ref={eyesRef}
        style={{ display: "flex", gap, willChange: "transform" }}
      >
        <span
          ref={leftRef}
          style={{
            width: eyeW, height: eyeH, borderRadius: eyeW,
            background: "#f7f7f5", display: "block",
            transformOrigin: "center", willChange: "transform",
          }}
        />
        <span
          ref={rightRef}
          style={{
            width: eyeW, height: eyeH, borderRadius: eyeW,
            background: "#f7f7f5", display: "block",
            transformOrigin: "center", willChange: "transform",
          }}
        />
      </div>
    </div>
  );
}
