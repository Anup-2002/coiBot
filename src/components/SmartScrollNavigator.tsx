import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

/**
 * SmartScrollNavigator
 * - Device-adaptive: Only renders when the current page actually has meaningful vertical overflow
 *   on the user's screen (`scrollHeight - innerHeight >= 180`).
 * - Context-aware: Shows only "Go Below (↓)" at the top, both "↑ / ↓" in the middle, and only
 *   "Go Above (↑)" at the bottom.
 * - Non-obstructing: Detects open modals, toasts, or interactive buttons near the bottom-right corner
 *   and automatically adjusts its offset or hides so it never blocks clickable buttons or text.
 * - Self-blending: Fades into a subtle translucent edge pill when idle for 1.8s.
 */
export const SmartScrollNavigator: React.FC = () => {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScrollingOrHovered, setIsScrollingOrHovered] = useState(false);
  const [safeBottomPx, setSafeBottomPx] = useState(20);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<number | null>(null);

  const measureAndPosition = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const docEl = document.documentElement;
    const scrollTop = window.scrollY || docEl.scrollTop || 0;
    const viewportHeight = window.innerHeight || docEl.clientHeight || 0;
    const scrollHeight = Math.max(docEl.scrollHeight || 0, document.body?.scrollHeight || 0);
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);

    // Only show on devices/pages where scrolling is actually needed
    const needsScroll = maxScroll >= 180;
    setIsOverflowing(needsScroll);

    if (!needsScroll) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }

    setCanScrollUp(scrollTop > 100);
    setCanScrollDown(maxScroll - scrollTop > 100);

    // Hide when a modal backdrop is active
    const modalBackdrop = document.querySelector(".fixed.inset-0");
    setIsModalOpen(Boolean(modalBackdrop));

    // Smart collision avoidance: check if an interactive button/toast sits in the bottom-right area
    const probeX = Math.max(24, window.innerWidth - 32);
    const candidateBottoms = [20, 76, 128];
    let chosenBottom = 20;

    for (const candidate of candidateBottoms) {
      const probeY = Math.max(24, viewportHeight - candidate - 24);
      const elementsAtSpot = document.elementsFromPoint(probeX, probeY);
      const hitsInteractive = elementsAtSpot.some((el) => {
        if (containerRef.current && containerRef.current.contains(el)) return false;
        const tag = el.tagName.toLowerCase();
        if (tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea") {
          return true;
        }
        if (el.closest("button, a, input, select, textarea, [role='button'], [role='alert']")) {
          return true;
        }
        return false;
      });
      if (!hitsInteractive) {
        chosenBottom = candidate;
        break;
      }
    }

    setSafeBottomPx(chosenBottom);
  }, []);

  useEffect(() => {
    measureAndPosition();

    const triggerActive = () => {
      setIsScrollingOrHovered(true);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        setIsScrollingOrHovered(false);
      }, 1800);
    };

    const handleScroll = () => {
      measureAndPosition();
      triggerActive();
    };

    const handleResize = () => {
      measureAndPosition();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && document.body) {
      resizeObserver = new ResizeObserver(() => {
        measureAndPosition();
      });
      resizeObserver.observe(document.body);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [measureAndPosition]);

  if (!isOverflowing || isModalOpen || (!canScrollUp && !canScrollDown)) {
    return null;
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    const docEl = document.documentElement;
    const scrollHeight = Math.max(docEl.scrollHeight || 0, document.body?.scrollHeight || 0);
    window.scrollTo({ top: scrollHeight, behavior: "smooth" });
  };

  return (
    <div
      ref={containerRef}
      style={{ bottom: `${safeBottomPx}px` }}
      onMouseEnter={() => {
        if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        setIsScrollingOrHovered(true);
      }}
      onMouseLeave={() => {
        idleTimerRef.current = window.setTimeout(() => {
          setIsScrollingOrHovered(false);
        }, 1200);
      }}
      className={`fixed right-2.5 sm:right-4 z-40 flex flex-col items-center gap-1 p-1 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-xl transition-all duration-200 ${
        isScrollingOrHovered
          ? "opacity-95 scale-100"
          : "opacity-35 hover:opacity-100 scale-90 hover:scale-100"
      }`}
      aria-label="Quick page scroll navigation"
    >
      {canScrollUp && (
        <button
          type="button"
          onClick={scrollToTop}
          title="Jump directly to top of page"
          aria-label="Jump directly to top of page"
          className="p-2 rounded-xl bg-slate-800/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700/70 hover:border-indigo-500 transition-all duration-150 cursor-pointer active:scale-95 shadow-sm"
        >
          <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
      )}
      {canScrollDown && (
        <button
          type="button"
          onClick={scrollToBottom}
          title="Jump directly to bottom of page"
          aria-label="Jump directly to bottom of page"
          className="p-2 rounded-xl bg-slate-800/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700/70 hover:border-indigo-500 transition-all duration-150 cursor-pointer active:scale-95 shadow-sm"
        >
          <ArrowDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
      )}
    </div>
  );
};

