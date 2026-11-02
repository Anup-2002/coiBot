import React from "react";
import {
  Clock,
  Bell,
  BellOff,
  Terminal as TerminalIcon,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  Play,
  Pause,
  Square,
  Image as ImageIcon,
  Upload,
  Info,
  Users,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Shield,
  AlertTriangle,
  ExternalLink,
  Lock,
} from "lucide-react";
import { CustomSelect } from "../components/CustomSelect";

const SchedulerCollapsible: React.FC<{
  className?: string;
  headerLeft: (expanded: boolean, toggle: () => void) => React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ className = "", headerLeft, headerRight, children }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {headerLeft(expanded, () => setExpanded((prev) => !prev))}
        {headerRight}
      </div>
      {expanded && children}
    </div>
  );
};

export function renderSchedulerPage(schedulerData: any, toggleNotifications: any, notificationsEnabled: any, setLogsTab: any, navigateTo: any, isSchedulerActionPending: any, isSchedulerRunning: any, handleToggleScheduler: any, schedulerIntervalInput: any, setSchedulerIntervalInput: any, handleUpdateSchedulerInterval: any, targetCoinsCount: any, handleUpdateTargetCoins: any, isBusy: any, handleResumeScheduler: any, handleRunSchedulerNow: any, handlePauseScheduler: any, handleStopScheduler: any, imageUploadEnabled: any, marketingImages: any, imageSelectionMode: any, handleToggleImageUpload: any, isUpdatingImageSettings: any, imageFileInputRef: any, isUploadingImages: any, setActiveTab: any, handleResetLoginState: any, setLoginTab: any, setShowSessionModal: any, handleDragStart: any, handleDragOver: any, handleDrop: any, draggedAccountIndex: any, handleDirectOrderInput: any, handleMoveAccount: any, handleUpdateAccountSchedule: any) {
  const isSettingsLocked = Boolean(
    isSchedulerActionPending || isSchedulerRunning || schedulerData?.enabled || schedulerData?.cycleRunning
  );
  const enabledAccsCount = (schedulerData?.accounts || []).filter((a: any) =>
    a.schedule?.frequency === "weekly" ? Boolean(a.schedule?.useForNow) : Boolean(a.schedule?.enabled)
  ).length;

  return (
        /* DEDICATED ISOLATED MULTI-ACCOUNT SCHEDULER SCREEN (/scheduler) */
        <main key="view-scheduler" className="flex-1 p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* UNIFIED SCHEDULER HEADER & MASTER SWITCH BAR */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                  <Clock className={`h-6 w-6 ${schedulerData?.cycleRunning ? "text-emerald-400 animate-spin" : "text-indigo-400"}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg font-bold text-white tracking-tight">
                      24/7 Multi-Account Auto-Scheduler
                    </h1>
                    <span className={`px-2.5 py-0.5 text-xs rounded-full font-mono font-bold uppercase tracking-wider ${
                      schedulerData?.cycleRunning
                        ? "bg-emerald-400 text-slate-950 animate-pulse"
                        : schedulerData?.enabled
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : schedulerData?.savedPosition
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}>
                      {schedulerData?.cycleRunning
                        ? "Cycle Running"
                        : schedulerData?.enabled
                          ? "24/7 Active"
                          : schedulerData?.savedPosition
                            ? "Cycle Paused"
                            : "Standby"}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    Fetches trending coins, splits them across your {enabledAccsCount} active account{enabledAccsCount === 1 ? "" : "s"}, and posts sequentially on schedule.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Master Sequential Mode Switch Button */}
                <button
                  type="button"
                  disabled={isSchedulerActionPending || isSchedulerRunning}
                  onClick={() => handleToggleScheduler()}
                  title={
                    isSchedulerRunning
                      ? "Pause or stop the active cycle before toggling Sequential Mode"
                      : schedulerData?.enabled
                        ? "Click to disarm automatic 24/7 rotation (unlocks cycle settings)"
                        : "Click to arm automatic 24/7 multi-account rotation"
                  }
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm whitespace-nowrap ${
                    schedulerData?.enabled
                      ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                  }`}
                >
                  {isSchedulerActionPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : schedulerData?.enabled ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>
                    {schedulerData?.enabled ? "Sequential Mode: ON" : "Sequential Mode: OFF"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLogsTab("scheduler");
                    navigateTo("logs");
                  }}
                  className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm whitespace-nowrap shrink-0"
                  title="View Scheduler Execution Logs"
                >
                  <TerminalIcon className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Scheduler Logs</span>
                </button>
              </div>
            </div>

            {/* 4-CARD CYCLE METRICS & EXECUTION CONTROLS */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-3.5">
              {/* 1. Cycle State */}
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cycle State</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 whitespace-nowrap shrink-0">
                      {schedulerData?.dailyCycleCount || 0}/{schedulerData?.maxCyclesPerDay || 4} Today
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      schedulerData?.cycleRunning
                        ? "bg-emerald-400 animate-ping"
                        : schedulerData?.savedPosition
                          ? "bg-amber-400"
                          : schedulerData?.enabled
                            ? "bg-emerald-400"
                            : "bg-slate-500"
                    }`} />
                    <span className="text-base font-bold text-white truncate">
                      {schedulerData?.cycleRunning
                        ? "Cycle Running"
                        : schedulerData?.savedPosition
                          ? "Cycle Paused"
                          : schedulerData?.enabled
                            ? "Scheduled & Ready"
                            : "Standby"}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-400 truncate pt-1">
                  {schedulerData?.cycleRunning ? (
                    <>Current: <span className="font-semibold text-emerald-300">
                      {(() => {
                        if (!schedulerData?.currentAccountId) return "Starting...";
                        const cur = schedulerData.accounts.find((a: any) => a.id === schedulerData.currentAccountId);
                        return cur ? cur.name : schedulerData.currentAccountId;
                      })()}
                    </span></>
                  ) : schedulerData?.nextCycleAt ? (
                    <>Next Run: <span className="font-mono font-semibold text-emerald-400">{new Date(schedulerData.nextCycleAt).toLocaleTimeString()}</span></>
                  ) : (
                    <>Next Run: <span className="text-slate-500">Enable Sequential Mode to schedule</span></>
                  )}
                </div>
              </div>

              {/* 2. Cycle Window (Locked when Sequential Mode is ON or Running) */}
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    {isSettingsLocked && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                    <span>Cycle Window</span>
                  </span>
                  <span className="text-xs text-indigo-400 font-mono font-bold whitespace-nowrap shrink-0">
                    {schedulerData?.intervalMinutes || 360}m ({Math.max(1, Math.round(1440 / (schedulerData?.intervalMinutes || 360)))}x / 24h)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <button
                    type="button"
                    disabled={isSettingsLocked}
                    onClick={() => {
                      setSchedulerIntervalInput(360);
                      handleUpdateSchedulerInterval(360);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
                      (schedulerData?.intervalMinutes || 360) === 360
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                    title={isSettingsLocked ? "Turn Sequential Mode OFF before changing interval" : "6 hours per cycle (4 cycles in 24 hours)"}
                  >
                    360m (6h)
                  </button>
                  <button
                    type="button"
                    disabled={isSettingsLocked}
                    onClick={() => {
                      setSchedulerIntervalInput(480);
                      handleUpdateSchedulerInterval(480);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
                      schedulerData?.intervalMinutes === 480
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                    title={isSettingsLocked ? "Turn Sequential Mode OFF before changing interval" : "8 hours per cycle (3 cycles in 24 hours)"}
                  >
                    480m (8h)
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    disabled={isSettingsLocked}
                    value={schedulerIntervalInput}
                    onChange={(e) => setSchedulerIntervalInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateSchedulerInterval(schedulerIntervalInput)}
                    disabled={isSettingsLocked}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    Save
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {isSettingsLocked
                    ? "Locked while active — turn Sequential Mode OFF to edit"
                    : `Rest gap = ${schedulerData?.intervalMinutes || 360}m slot minus runtime (min 15m)`}
                </div>
              </div>

              {/* 3. Target Coins / Cycle (Locked when Sequential Mode is ON or Running) */}
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    {isSettingsLocked && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                    <span>Target Coins / Cycle</span>
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap shrink-0">
                    {targetCoinsCount === 0 ? "All Coins" : `Top ${targetCoinsCount}`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {[10, 30, 50, 0].map((count) => (
                    <button
                      key={count}
                      type="button"
                      disabled={isSettingsLocked}
                      onClick={() => handleUpdateTargetCoins(count)}
                      className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${
                        targetCoinsCount === count
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
                      }`}
                      title={
                        isSettingsLocked
                          ? "Turn Sequential Mode OFF before changing target coins"
                          : count === 0
                            ? "Fetch all available trending coins and split them evenly across active accounts"
                            : `Process top ${count} coins total across enabled accounts`
                      }
                    >
                      {count === 0 ? "ALL" : `Top ${count}`}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {isSettingsLocked
                    ? "Locked while active — turn Sequential Mode OFF to edit"
                    : (() => {
                        const activeCount = Math.max(1, enabledAccsCount);
                        return targetCoinsCount === 0
                          ? `Split evenly across ${activeCount} active account${activeCount > 1 ? "s" : ""}`
                          : `${targetCoinsCount} coins ÷ ${activeCount} account${activeCount > 1 ? "s" : ""} (~${Math.ceil(targetCoinsCount / activeCount)}/account)`;
                      })()}
                </div>
              </div>

              {/* 4. Cycle Execution Controls */}
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Execution Controls
                  </span>
                  {schedulerData?.cycleRunning && (
                    <span className="text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1 whitespace-nowrap shrink-0">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Running
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || schedulerData?.cycleRunning || isBusy}
                    onClick={schedulerData?.savedPosition ? handleResumeScheduler : handleRunSchedulerNow}
                    title={isBusy ? "Cannot start scheduler cycle: another process is currently running." : (schedulerData?.savedPosition ? "Resume sequential cycle from saved position" : "Start sequential cycle immediately")}
                    className="flex-1 min-w-[125px] px-3 py-2 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-indigo-500/20 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {isSchedulerActionPending && !schedulerData?.cycleRunning ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-white shrink-0" />
                    )}
                    <span>
                      {schedulerData?.cycleRunning
                        ? "Running..."
                        : schedulerData?.savedPosition
                          ? "Resume"
                          : "Run cycle now"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || !schedulerData?.cycleRunning}
                    onClick={handlePauseScheduler}
                    className="px-2.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold rounded-xl shadow transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Pause className="h-3.5 w-3.5 shrink-0" />
                    <span>Pause</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || (!schedulerData?.cycleRunning && !schedulerData?.enabled && !schedulerData?.savedPosition)}
                    onClick={handleStopScheduler}
                    className="px-2.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold rounded-xl shadow transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3.5 w-3.5 shrink-0" />
                    <span>Stop</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 text-center">
                  1-click start • Live state updates every 3s
                </div>
              </div>
            </div>

            {/* COMPACT COLLAPSIBLE SCHEDULED IMAGES BAR */}
            <SchedulerCollapsible
              className={`px-4 py-2.5 rounded-xl border flex flex-col gap-2.5 transition-all duration-150 ${
                imageUploadEnabled
                  ? "bg-indigo-950/25 border-indigo-500/40"
                  : "bg-slate-950/70 border-slate-800"
              }`}
              headerLeft={(expanded, toggle) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                  title="Click to show or hide scheduled image upload & library tools"
                >
                  <span className={`p-1.5 rounded-lg border shrink-0 ${
                    imageUploadEnabled
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                      : "bg-slate-900 text-slate-400 border-slate-800"
                  }`}>
                    <ImageIcon className="h-4 w-4" />
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-white transition">
                    Scheduled Cycle Images
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                    imageUploadEnabled
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-slate-900 text-slate-400 border-slate-800"
                  }`}>
                    {imageUploadEnabled
                      ? `ACTIVE • ${marketingImages.length} (${imageSelectionMode === "cycle" ? "Sequential" : "Random"})`
                      : `PAUSED • Text-Only (${marketingImages.length})`}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 group-hover:text-slate-200 font-semibold px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "rotate-180 text-indigo-400" : ""}`} />
                  </span>
                </button>
              )}
              headerRight={
                <button
                  type="button"
                  onClick={() => handleToggleImageUpload()}
                  disabled={isUpdatingImageSettings}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    imageUploadEnabled
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm"
                      : "bg-slate-900 hover:bg-slate-800 text-indigo-300 border-indigo-500/30"
                  }`}
                >
                  {imageUploadEnabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  <span>{imageUploadEnabled ? "Pause Images" : "Enable Images"}</span>
                </button>
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-800/80">
                <p className="text-xs text-slate-400">
                  Attaches 1 marketing graphic per comment across all scheduled account turns when enabled.
                </p>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => imageFileInputRef.current?.click()}
                    disabled={isUploadingImages}
                    className="px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isUploadingImages ? "Uploading..." : "Upload Images"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("images");
                      navigateTo("dashboard");
                      setTimeout(() => {
                        document.getElementById("storage-explorer")?.scrollIntoView({ behavior: "smooth" });
                      }, 120);
                    }}
                    className="px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Image Library ({marketingImages.length})</span>
                  </button>
                </div>
              </div>
            </SchedulerCollapsible>
          </div>

          {/* ACCOUNTS SCHEDULE TABLE */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <SchedulerCollapsible
              className="px-5 py-4 border-b border-slate-800"
              headerLeft={(expanded, toggle) => (
                <div className="flex flex-wrap items-center gap-2.5">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                      <span>Rotation Queue &amp; Execution Order</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {enabledAccsCount} Active / {schedulerData?.accounts?.length || 0} Total
                      </span>
                      <button
                        type="button"
                        onClick={toggle}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition cursor-pointer"
                        title="How Active vs Standby rotation works"
                      >
                        <Info className="h-3 w-3 text-indigo-400" />
                        <span>How Rotation Works</span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-180 text-indigo-400" : ""}`} />
                      </button>
                    </h4>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Accounts run strictly in order (#1 → #2 → #3). Check <strong className="text-emerald-400">Active in Cycle</strong> on accounts you want in the rotation.
                    </span>
                  </div>
                </div>
              )}
              headerRight={
                <button
                  type="button"
                  onClick={() => {
                    handleResetLoginState();
                    setLoginTab("credentials");
                    setShowSessionModal(true);
                  }}
                  className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shrink-0"
                  title="Add or manage CoinMarketCap accounts"
                >
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>Manage Accounts</span>
                </button>
              }
            >
              <div className="mt-3 p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-xs text-slate-300 leading-relaxed">
                <strong className="text-white">Active vs. Standby Backup Accounts:</strong> Accounts marked <span className="text-emerald-400 font-semibold font-mono">Active in Cycle</span> split each batch of trending coins evenly and post one after another. Unchecked accounts stay on <span className="text-amber-300 font-semibold font-mono">Standby / Backup</span> with their saved sessions ready to enable anytime in one click.
              </div>
            </SchedulerCollapsible>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <th className="py-3 px-4 font-semibold text-center w-24">Order</th>
                    <th className="py-3 px-4 font-semibold">Account</th>
                    <th className="py-3 px-4 font-semibold min-w-[180px]">Cycle Role</th>
                    <th className="py-3 px-4 font-semibold min-w-[190px]">Frequency</th>
                    <th className="py-3 px-4 font-semibold min-w-[180px]">Last Run</th>
                    <th className="py-3 px-4 font-semibold min-w-[140px]">Next Due</th>
                    <th className="py-3 px-4 font-semibold text-center w-28">Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {(!schedulerData?.accounts || schedulerData.accounts.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2.5">
                          <span className="italic">No profiles found. Add or import an account profile to start scheduling.</span>
                          <button
                            onClick={() => {
                              handleResetLoginState();
                              setLoginTab("credentials");
                              setShowSessionModal(true);
                            }}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Users className="h-3.5 w-3.5" /> Add Account
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    [...schedulerData.accounts]
                      .sort((a: any, b: any) => a.schedule.order - b.schedule.order)
                      .map((acc: any, index: number, sortedArr: any[]) => {
                        const isCurrent = acc.id === schedulerData.currentAccountId;
                        const isFirst = index === 0;
                        const isLast = index === sortedArr.length - 1;
                        const isCheckedNow = acc.schedule.frequency === "weekly"
                          ? Boolean(acc.schedule.useForNow)
                          : Boolean(acc.schedule.enabled);

                        return (
                          <tr
                            key={acc.id}
                            draggable={!isSchedulerRunning}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            className={`transition-all duration-150 select-none ${
                              draggedAccountIndex === index
                                ? "opacity-30 border-2 border-dashed border-indigo-400 bg-indigo-950/40"
                                : "hover:bg-slate-900/60"
                            } ${
                              isCurrent ? "bg-indigo-950/30 border-l-4 border-indigo-500" : ""
                            }`}
                          >
                            {/* Order, Drag Handle, Quick Position Select & Movement Arrows */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <div
                                  title={isSchedulerRunning ? "Reordering is locked while scheduler is running" : "Drag row to reorder"}
                                  className={`p-1 rounded transition ${isSchedulerRunning ? 'cursor-not-allowed opacity-30 text-slate-600' : 'cursor-grab active:cursor-grabbing text-slate-500 hover:text-indigo-400 hover:bg-slate-800'}`}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>

                                <CustomSelect
                                  disabled={isSchedulerRunning}
                                  value={acc.schedule.order}
                                  accent="indigo"
                                  menuMinWidth={100}
                                  className="font-mono text-indigo-300"
                                  title={isSchedulerRunning ? "Locked while scheduler is running" : "Select execution order"}
                                  options={sortedArr.map((_: any, pIdx: number) => ({
                                    value: pIdx + 1,
                                    label: `#${pIdx + 1}`,
                                  }))}
                                  onChange={(val) => handleDirectOrderInput(acc.id, parseInt(val) || 1)}
                                />

                                <div className="flex flex-col gap-0.5">
                                  <button
                                    type="button"
                                    disabled={isFirst || isSchedulerRunning}
                                    onClick={() => handleMoveAccount(index, "up")}
                                    className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                                    title="Move 1 step up"
                                    aria-label="Move 1 step up"
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLast || isSchedulerRunning}
                                    onClick={() => handleMoveAccount(index, "down")}
                                    className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                                    title="Move 1 step down"
                                    aria-label="Move 1 step down"
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Account name & info */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-white text-sm flex items-center gap-1.5 flex-wrap">
                                  {acc.name}
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.2 bg-indigo-500 text-slate-950 text-[9px] font-bold rounded animate-pulse">
                                      RUNNING NOW
                                    </span>
                                  )}
                                </span>
                                {acc.communityProfileUrl && (
                                  <a
                                    href={acc.communityProfileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 hover:underline inline-flex items-center gap-1 w-fit"
                                    title={`Open ${acc.cmcUsername || acc.name} on CoinMarketCap Community to verify posted comments`}
                                  >
                                    @{acc.cmcUsername || "Profile"} {acc.cmcNickname && acc.cmcNickname !== acc.cmcUsername ? `(${acc.cmcNickname})` : ""} <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Clean 1-Pill Cycle Role Toggle */}
                            <td className="py-3 px-4">
                              <label
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition select-none ${
                                  isSchedulerRunning ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                } ${
                                  isCheckedNow
                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                                }`}
                                title={
                                  isCheckedNow
                                    ? "Included in scheduled rotation — click to set as Standby / Backup"
                                    : "Standby / Backup account — click to include in active rotation"
                                }
                              >
                                <input
                                  type="checkbox"
                                  disabled={isSchedulerRunning}
                                  checked={isCheckedNow}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    if (acc.schedule.frequency === "weekly") {
                                      handleUpdateAccountSchedule({
                                        id: acc.id,
                                        enabled: true,
                                        useForNow: checked,
                                      });
                                    } else {
                                      handleUpdateAccountSchedule({
                                        id: acc.id,
                                        enabled: checked,
                                        useForNow: checked,
                                      });
                                    }
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950 transition cursor-pointer accent-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                                />
                                {isCheckedNow ? (
                                  <span>{acc.schedule.frequency === "weekly" ? "Active (This Week)" : "Active in Cycle"}</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <Shield className="h-3 w-3 text-amber-400/80 shrink-0" />
                                    <span>Standby / Backup</span>
                                  </span>
                                )}
                              </label>
                            </td>

                            {/* Frequency dropdown & custom input */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <CustomSelect
                                  disabled={isSchedulerRunning}
                                  value={acc.schedule.frequency}
                                  accent="indigo"
                                  menuMinWidth={180}
                                  className="text-slate-100 py-1 px-2.5"
                                  title={isSchedulerRunning ? "Locked while scheduler is running" : "Select posting frequency"}
                                  options={[
                                    { value: "every_cycle", label: "Every cycle" },
                                    { value: "daily", label: "Daily (24h)" },
                                    { value: "weekly", label: "Weekly (Manual)" },
                                    { value: "custom", label: "Custom hours" },
                                  ]}
                                  onChange={(val) =>
                                    handleUpdateAccountSchedule({
                                      id: acc.id,
                                      frequency: val as any,
                                      ...(val === "custom" && !acc.schedule.customHours ? { customHours: 24 } : {}),
                                    })
                                  }
                                />

                                {acc.schedule.frequency === "custom" && (
                                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                                    <input
                                      type="number"
                                      min={1}
                                      max={720}
                                      disabled={isSchedulerRunning}
                                      value={acc.schedule.customHours || 24}
                                      onChange={(e) => {
                                        const val = Math.min(720, Math.max(1, parseInt(e.target.value) || 1));
                                        handleUpdateAccountSchedule({ id: acc.id, customHours: val });
                                      }}
                                      className="w-12 bg-transparent text-xs text-white text-center focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-[10px] text-slate-400">hrs</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Last run */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    {acc.lastRun.at ? new Date(acc.lastRun.at).toLocaleString() : "Never run"}
                                  </span>
                                  {acc.lastRun.status && (
                                    <span className={`px-1.5 py-0.5 text-[9px] rounded font-semibold uppercase ${
                                      acc.lastRun.status === "completed"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : acc.lastRun.status === "skipped_not_due"
                                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                          : acc.lastRun.status === "skipped_missing_session"
                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                            : acc.lastRun.status === "skipped_expired"
                                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                              : acc.lastRun.status === "stopped_daily_limit"
                                                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                                : acc.lastRun.status === "stopped_captcha"
                                                  ? "bg-rose-600/30 text-rose-200 border border-rose-500"
                                                  : acc.lastRun.status === "stopped_by_user"
                                                    ? "bg-amber-600/20 text-amber-300 border border-amber-500/30"
                                                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                                    }`}>
                                      {acc.lastRun.status.replace(/_/g, " ")}
                                    </span>
                                  )}
                                </div>
                                {acc.lastRun.at && (
                                  <span className="text-xs font-mono text-slate-300">
                                    <span className="text-emerald-400 font-bold">{acc.lastRun.posted} posted</span>,{" "}
                                    <span className={acc.lastRun.failed > 0 ? "text-rose-400 font-bold" : "text-slate-400"}>{acc.lastRun.failed} failed</span>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Next due */}
                            <td className="py-3 px-4 font-mono text-[11px]">
                              {acc.schedule.enabled === false ? (
                                <span className="text-slate-500 italic">Standby</span>
                              ) : acc.schedule.useForNow ? (
                                <span className="text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Due now
                                </span>
                              ) : acc.schedule.frequency === "every_cycle" ? (
                                <span className="text-indigo-400 font-semibold">Every cycle</span>
                              ) : acc.schedule.frequency === "weekly" ? (
                                <span className="text-amber-300/80 italic">Manual check</span>
                              ) : acc.nextDueAt ? (
                                <div className="flex flex-col">
                                  <span className="text-slate-300">{new Date(acc.nextDueAt).toLocaleString()}</span>
                                  <span className="text-[10px] text-slate-500">
                                    {new Date(acc.nextDueAt).getTime() <= Date.now() ? "Due now" : "Upcoming"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-emerald-400 font-semibold">Due now</span>
                              )}
                            </td>

                            {/* Session */}
                            <td className="py-3 px-4 text-center">
                              {acc.hasValidSession ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle className="h-3 w-3" />
                                  Valid
                                </span>
                              ) : (acc.loginStatus === "expired" || acc.lastRun?.status === "skipped_expired") ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  <AlertTriangle className="h-3 w-3" />
                                  Expired
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  <AlertTriangle className="h-3 w-3" />
                                  Missing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </main>
  );
}
