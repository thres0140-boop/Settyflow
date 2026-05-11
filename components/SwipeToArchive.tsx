"use client";

import { useRef, useState } from "react";

// iOS-style swipe-right-on-row to archive (per Cenk's request — convention is
// usually swipe-left, but the user explicitly asked for right). A green band
// with an archive icon is revealed from the left edge as the row translates;
// past the threshold the row commits, animates off-screen, and calls onArchive.
//
// Notes:
// - We swallow the synthetic click that iOS fires after touchend so the
//   wrapping <Link> doesn't navigate when the user only meant to archive.
// - Locks to horizontal once the touch resolves to a side-swipe, leaving
//   vertical scrolling untouched.

const THRESHOLD = 90;  // px before release counts as commit
const MAX = 200;       // hard clamp on translation
const COMMIT_TRAVEL = 600; // how far the row flies off after commit

export default function SwipeToArchive({
  onArchive,
  children,
  mode = "archive",
}: {
  onArchive: () => void;
  children: React.ReactNode;
  /** "archive" reveals a green Archive band; "unarchive" reveals a blue Unarchive band. */
  mode?: "archive" | "unarchive";
}) {
  const label = mode === "archive" ? "Archive" : "Unarchive";
  const activeBg = mode === "archive" ? "#16a34a" /* green-600 */ : "#2563eb" /* blue-600 */;
  const [tx, setTx] = useState(0);
  const [committing, setCommitting] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lock = useRef<"horizontal" | "vertical" | null>(null);
  const triggered = useRef(false);
  const swallowClick = useRef(false);

  function start(e: React.TouchEvent) {
    if (committing) return;
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

    e.stopPropagation();

    const clamped = Math.min(MAX, dx);
    setTx(clamped);

    if (!triggered.current && clamped >= THRESHOLD) {
      triggered.current = true;
      if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
        (navigator as any).vibrate(10);
      }
    } else if (triggered.current && clamped < THRESHOLD) {
      triggered.current = false;
    }
  }

  function end(e: React.TouchEvent) {
    const wasHorizontal = lock.current === "horizontal";
    if (wasHorizontal && tx > 0) {
      // We claimed this gesture — make sure the synthetic click that iOS
      // emits after touchend doesn't navigate into the thread.
      swallowClick.current = true;
      setTimeout(() => {
        swallowClick.current = false;
      }, 400);
    }

    if (wasHorizontal && triggered.current) {
      e.preventDefault();
      e.stopPropagation();
      // Animate off-screen, then call onArchive (which will remove the row
      // from the list, so the user sees a clean disappear rather than a snap).
      setCommitting(true);
      setTx(COMMIT_TRAVEL);
      setTimeout(() => {
        onArchive();
        // Don't reset tx — the parent will unmount us by removing the row.
      }, 200);
    } else {
      setTx(0);
    }

    startX.current = null;
    startY.current = null;
    lock.current = null;
    triggered.current = false;
  }

  function handleClickCapture(e: React.MouseEvent) {
    if (swallowClick.current) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick.current = false;
    }
  }

  const progress = Math.min(1, tx / THRESHOLD);
  const past = tx >= THRESHOLD;

  return (
    <div
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      onTouchCancel={end}
      onClickCapture={handleClickCapture}
      className="relative overflow-hidden"
      style={{ touchAction: "pan-y" }}
    >
      {/* Background reveal — sits behind the row, shows as the row slides */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-start pl-5 pointer-events-none"
        style={{
          background: past ? activeBg : "var(--surface-2)",
          transition: "background 120ms",
        }}
      >
        <div
          className="flex items-center gap-2 text-white"
          style={{ opacity: progress }}
        >
          {mode === "archive" ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h18v4H3z" />
              <path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
              <path d="M10 15h4" />
            </svg>
          ) : (
            /* unarchive — box with an up-arrow coming out of it */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h18v4H3z" />
              <path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
              <path d="M12 18v-7" />
              <path d="M9 14l3-3 3 3" />
            </svg>
          )}
          <span className="text-sm font-medium">{label}</span>
        </div>
      </div>

      <div
        style={{
          transform: `translateX(${tx}px)`,
          transition:
            tx === 0 || committing
              ? "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "none",
          background: "var(--background)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
