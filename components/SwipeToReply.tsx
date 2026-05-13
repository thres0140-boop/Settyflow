"use client";

import { useRef, useState } from "react";

// WhatsApp-style swipe-right-on-bubble to trigger reply.
// - Locks to horizontal once the touch resolves to a side-swipe.
// - Shows a reply arrow growing from the left edge as the bubble translates.
// - Light haptic buzz on iOS when crossing the trigger threshold.

const THRESHOLD = 60; // px the bubble must travel before release counts as reply
const MAX = 110;      // hard clamp on translation

export default function SwipeToReply({
  onReply,
  children,
}: {
  onReply: () => void;
  children: React.ReactNode;
}) {
  const [tx, setTx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lock = useRef<"horizontal" | "vertical" | null>(null);
  const triggered = useRef(false);

  function start(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    lock.current = null;
    triggered.current = false;
  }

  function move(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (lock.current == null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        lock.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
    }

    if (lock.current !== "horizontal" || dx <= 0) return;

    // Once we've claimed the gesture, stop the touch from bubbling so the
    // parent scroll container / send button don't also act on it.
    e.stopPropagation();

    const clamped = Math.min(MAX, dx);
    setTx(clamped);

    if (!triggered.current && clamped >= THRESHOLD) {
      triggered.current = true;
      if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
        (navigator as any).vibrate(8);
      }
    } else if (triggered.current && clamped < THRESHOLD) {
      triggered.current = false;
    }
  }

  function end(e: React.TouchEvent) {
    const wasHorizontal = lock.current === "horizontal";
    if (wasHorizontal && triggered.current) {
      // Prevent the synthetic click event iOS fires after touchend from
      // hitting the send button or anything else underneath.
      e.preventDefault();
      e.stopPropagation();
      onReply();
    }
    setTx(0);
    startX.current = null;
    startY.current = null;
    lock.current = null;
    triggered.current = false;
  }

  const progress = Math.min(1, tx / THRESHOLD);
  const past = tx >= THRESHOLD;

  return (
    <div
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      onTouchCancel={end}
      className="relative min-w-0"
      style={{
        transform: `translateX(${tx}px)`,
        transition: tx === 0 ? "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)" : "none",
        touchAction: "pan-y",
      }}
    >
      {/* Reply hint — sits behind the bubble, peeks out on swipe */}
      <div
        aria-hidden
        className="absolute top-1/2 -left-12 flex items-center justify-center w-9 h-9 rounded-full pointer-events-none"
        style={{
          transform: `translateY(-50%) scale(${0.5 + progress * 0.5})`,
          opacity: progress,
          background: past ? "var(--accent)" : "var(--surface-2)",
          color: past ? "white" : "var(--muted)",
          transition: "background 120ms, color 120ms",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>↩</span>
      </div>

      {children}
    </div>
  );
}
