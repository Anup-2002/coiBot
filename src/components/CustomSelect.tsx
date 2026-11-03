import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ChevronDown, CheckCircle } from "lucide-react";
import type { CustomSelectOption } from "../types";

export const CustomSelect: React.FC<{
  value: string | number;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
  accent?: "emerald" | "indigo";
  className?: string;
  menuMinWidth?: number;
  iconOnly?: boolean;
  alignToParent?: boolean;
}> = ({
  value,
  options,
  onChange,
  disabled = false,
  title,
  accent = "indigo",
  className = "",
  menuMinWidth = 180,
  iconOnly = false,
  alignToParent = false,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  const selectedOption = options.find((o) => String(o.value) === String(value)) || options[0];

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const anchorEl =
      alignToParent
        ? (triggerRef.current.closest("[data-select-anchor]") as HTMLElement) ||
          triggerRef.current.parentElement?.parentElement ||
          triggerRef.current
        : triggerRef.current;
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = alignToParent ? Math.max(rect.width, 190) : Math.max(rect.width, menuMinWidth);
    const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(240, options.length * 38 + 16);
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      width: menuWidth,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, options.length, menuMinWidth, alignToParent]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const handleBlur = () => setOpen(false);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("blur", handleBlur);
    };
  }, [open]);

  const activeRingClass =
    accent === "emerald"
      ? "border-emerald-500/60 ring-2 ring-emerald-500/20"
      : "border-indigo-500/60 ring-2 ring-indigo-500/20";

  const hoverBorderClass =
    accent === "emerald" ? "hover:border-emerald-500/50" : "hover:border-indigo-500/50";

  return (
    <div className={`relative inline-flex ${iconOnly ? "items-stretch" : "items-center"}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => {
          if (disabled) return;
          if (!open) {
            updatePosition();
            setOpen(true);
          } else {
            setOpen(false);
          }
        }}
        className={`inline-flex items-center justify-between ${iconOnly ? "gap-0 px-2 py-1.5" : `gap-2 bg-slate-900 border border-slate-700/90 rounded-xl px-2.5 py-1 shadow-sm ${hoverBorderClass} ${open ? activeRingClass : ""}`} text-sm font-bold transition duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        {!iconOnly && <span className="truncate">{selectedOption ? selectedOption.label : String(value)}</span>}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${
            open ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {open && !disabled && coords && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: coords.openUp ? undefined : coords.top,
            bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
            left: coords.left,
            width: alignToParent ? coords.width : undefined,
            minWidth: coords.width,
            maxWidth: "calc(100vw - 16px)",
            transition: "none",
          }}
          className="z-[100] bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-1.5 max-h-60 overflow-y-auto transition-none"
        >
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                title={opt.label}
                onClick={() => {
                  setOpen(false);
                  if (String(opt.value) !== String(value)) {
                    onChange(String(opt.value));
                  }
                }}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-sm font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                  isSelected
                    ? accent === "emerald"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                    : "text-slate-200 hover:bg-slate-800 hover:text-white border border-transparent"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-xs font-mono text-slate-200">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && (
                    <CheckCircle
                      className={`h-3.5 w-3.5 shrink-0 ${
                        accent === "emerald" ? "text-emerald-400" : "text-indigo-400"
                      }`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
