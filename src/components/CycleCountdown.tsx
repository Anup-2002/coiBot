import React, { useState, useEffect } from "react";

// Dedicated isolated countdown component to prevent re-rendering the entire App every second
export const CycleCountdown = React.memo(function CycleCountdown({ nextCycleStartTime }: { nextCycleStartTime: number | null }) {
  const [diff, setDiff] = useState<number | null>(() => {
    if (!nextCycleStartTime) return null;
    return Math.max(0, Math.floor((nextCycleStartTime - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!nextCycleStartTime) {
      setDiff(null);
      return;
    }
    const update = () => {
      const now = Date.now();
      const val = Math.max(0, Math.floor((nextCycleStartTime - now) / 1000));
      setDiff(val);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [nextCycleStartTime]);

  if (!nextCycleStartTime || diff === null || diff <= 0) return null;

  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return (
    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span className="text-[11px] text-emerald-400 font-bold">Cooldown Active</span>
      </div>
      <span className="font-mono text-sm text-slate-300">
        Next cycle in: <strong className="text-emerald-400 font-bold">{mins}m {secs}s</strong>
      </span>
    </div>
  );
});

