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
} from "lucide-react";
import { CustomSelect } from "../components/CustomSelect";

export function renderSchedulerPage(schedulerData: any, toggleNotifications: any, notificationsEnabled: any, setLogsTab: any, navigateTo: any, isSchedulerActionPending: any, isSchedulerRunning: any, handleToggleScheduler: any, schedulerIntervalInput: any, setSchedulerIntervalInput: any, handleUpdateSchedulerInterval: any, targetCoinsCount: any, handleUpdateTargetCoins: any, isBusy: any, handleResumeScheduler: any, handleRunSchedulerNow: any, handlePauseScheduler: any, handleStopScheduler: any, imageUploadEnabled: any, marketingImages: any, imageSelectionMode: any, handleToggleImageUpload: any, isUpdatingImageSettings: any, imageFileInputRef: any, isUploadingImages: any, setActiveTab: any, handleResetLoginState: any, setLoginTab: any, setShowSessionModal: any, handleDragStart: any, handleDragOver: any, handleDrop: any, draggedAccountIndex: any, handleDirectOrderInput: any, handleMoveAccount: any, handleUpdateAccountSchedule: any) {

  return (
        /* DEDICATED ISOLATED MULTI-ACCOUNT SCHEDULER SCREEN (/scheduler) */
        <main key="view-scheduler" className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* SCHEDULER HEADER & CONTROLS DECK */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                  Multi-Account Auto-Scheduler
                  <span className={`px-2.5 py-0.5 text-xs rounded-full font-mono font-semibold uppercase tracking-wider ${
                    schedulerData?.enabled
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}>
                    {schedulerData?.enabled ? "Scheduler Enabled" : "Scheduler Disabled"}
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Automatically rotates through your selected accounts one by one on a schedule.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleNotifications}
                className={`px-3.5 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-sm whitespace-nowrap shrink-0 ${
                  notificationsEnabled
                    ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                    : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
                }`}
                title={notificationsEnabled ? "In-app toast alerts are ON. Click to mute." : "In-app toast alerts are muted. Click to turn ON."}
              >
                {notificationsEnabled ? (
                  <Bell className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <BellOff className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span>{notificationsEnabled ? "Alerts: ON" : "Alerts: OFF"}</span>
              </button>
              <button
                onClick={() => {
                  setLogsTab("scheduler");
                  navigateTo("logs");
                }}
                className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm whitespace-nowrap shrink-0"
                title="View Scheduler Activity History"
              >
                <TerminalIcon className="h-4 w-4 text-indigo-400 shrink-0" /> Scheduler Logs
              </button>
              <button
                onClick={() => navigateTo("dashboard")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* TOP MASTER SWITCH & CYCLE METRICS PANEL */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Scheduler Engine Controls</span>
                  {schedulerData?.cycleRunning && (
                    <span className="px-2 py-0.5 text-xs rounded-full font-mono font-bold bg-indigo-500 text-slate-950 animate-pulse">
                      CYCLE IN PROGRESS
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-400">
                  Automatically fetches trending coins, divides them evenly across your selected accounts, and posts in order.
                </p>
              </div>

              {/* Master Switch: Run accounts in sequence (Prominent, Easily Detectable Action Bar) */}
              <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all duration-150 ${
                schedulerData?.enabled
                  ? "bg-indigo-950/50 border-indigo-500/40 shadow-md shadow-indigo-500/10"
                  : "bg-slate-900/90 border-slate-700/80"
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    schedulerData?.enabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        Run accounts in sequence
                      </span>
                      <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-md border ${
                        schedulerData?.enabled
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {schedulerData?.enabled ? "ENABLED • 24/7 ACTIVE" : "DISABLED"}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 block">
                      {schedulerData?.enabled
                        ? "Multi-account sequential queue is armed and ready"
                        : "Click to arm automatic multi-account rotation"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSchedulerActionPending || isSchedulerRunning}
                  onClick={() => handleToggleScheduler()}
                  title={isSchedulerRunning ? "Pause or stop the active cycle before disabling sequential mode" : (schedulerData?.enabled ? "Click to disable sequential scheduler" : "Click to enable sequential scheduler")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
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
              </div>
            </div>

            {/* CYCLE STATUS & CONTROLS BAR */}
            {isSchedulerRunning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium">
                Settings are locked while the scheduler is running. Pause or stop to change them.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              {/* Status & Current Account */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cycle State</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {schedulerData?.dailyCycleCount || 0}/{schedulerData?.maxCyclesPerDay || 4} Today
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${schedulerData?.cycleRunning ? "bg-indigo-400 animate-ping" : schedulerData?.savedPosition ? "bg-amber-400" : "bg-slate-500"}`} />
                    <span className="text-base font-bold text-white">
                      {schedulerData?.cycleRunning ? "Cycle Running" : schedulerData?.savedPosition ? "Cycle Paused" : schedulerData?.enabled ? "Scheduled & Ready" : "Standby"}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-400 truncate pt-1">
                  {schedulerData?.cycleRunning ? (
                    <>Current: <span className="font-semibold text-slate-200">
                      {(() => {
                        if (!schedulerData?.currentAccountId) return "None";
                        const cur = schedulerData.accounts.find((a: any) => a.id === schedulerData.currentAccountId);
                        return cur ? cur.name : schedulerData.currentAccountId;
                      })()}
                    </span></>
                  ) : schedulerData?.nextCycleAt ? (
                    <>Next Run: <span className="font-mono font-semibold text-emerald-400">{new Date(schedulerData.nextCycleAt).toLocaleTimeString()}</span></>
                  ) : (
                    <>Next Run: <span className="text-slate-500">Auto-scheduled on enable</span></>
                  )}
                </div>
              </div>

              {/* Interval Settings */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cycle Window (24h)</span>
                  <span className="text-xs text-indigo-400 font-mono font-bold">
                    {schedulerData?.intervalMinutes || 360}m ({Math.max(1, Math.round(1440 / (schedulerData?.intervalMinutes || 360)))}x / 24h)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || isSchedulerRunning}
                    onClick={() => {
                      setSchedulerIntervalInput(360);
                      handleUpdateSchedulerInterval(360);
                    }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold border transition cursor-pointer disabled:opacity-40 ${
                      (schedulerData?.intervalMinutes || 360) === 360
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                    title="6 hours per cycle (4 cycles in 24 hours)"
                  >
                    360m (6h)
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || isSchedulerRunning}
                    onClick={() => {
                      setSchedulerIntervalInput(480);
                      handleUpdateSchedulerInterval(480);
                    }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold border transition cursor-pointer disabled:opacity-40 ${
                      schedulerData?.intervalMinutes === 480
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                    title="8 hours per cycle (3 cycles in 24 hours)"
                  >
                    480m (8h)
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    disabled={isSchedulerActionPending || isSchedulerRunning}
                    value={schedulerIntervalInput}
                    onChange={(e) => setSchedulerIntervalInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={() => handleUpdateSchedulerInterval(schedulerIntervalInput)}
                    disabled={isSchedulerActionPending || isSchedulerRunning}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  Rest gap = {schedulerData?.intervalMinutes || 360}m slot minus cycle runtime (min 15m rest)
                </div>
              </div>

              {/* Target Batch Limit (Coins / Run) */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Target Coins / Cycle</span>
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {targetCoinsCount === 0 ? "All Live Coins" : `Top ${targetCoinsCount}`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {[10, 30, 50, 0].map((count) => (
                    <button
                      key={count}
                      type="button"
                      disabled={isSchedulerActionPending || isSchedulerRunning}
                      onClick={() => handleUpdateTargetCoins(count)}
                      className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        targetCoinsCount === count
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
                      }`}
                      title={count === 0 ? "Fetch all available trending coins and split them evenly across active accounts" : `Process top ${count} coins total across enabled accounts`}
                    >
                      {count === 0 ? "ALL" : `Top ${count}`}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-400">
                  {(() => {
                    const enabledAccs = Math.max(1, (schedulerData?.accounts || []).filter((a: any) => a.schedule?.enabled).length);
                    return targetCoinsCount === 0
                      ? `Live fetched coins split evenly across ${enabledAccs} active account${enabledAccs > 1 ? "s" : ""}`
                      : `${targetCoinsCount} coins ÷ ${enabledAccs} account${enabledAccs > 1 ? "s" : ""} (~${Math.ceil(targetCoinsCount / enabledAccs)}/account)`;
                  })()}
                </div>
              </div>

              {/* Cycle Action Buttons */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Cycle Execution Controls
                  </span>
                  {schedulerData?.cycleRunning && (
                    <span className="text-[11px] font-mono font-bold text-indigo-400 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || schedulerData?.cycleRunning || isBusy}
                    onClick={schedulerData?.savedPosition ? handleResumeScheduler : handleRunSchedulerNow}
                    title={isBusy ? "Cannot start scheduler cycle: another process is currently running." : (schedulerData?.savedPosition ? "Resume sequential cycle from saved position" : "Start sequential cycle immediately")}
                    className="flex-1 px-3 py-2.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-indigo-500/20 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                    className="px-2.5 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold rounded-xl shadow transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Pause className="h-3.5 w-3.5 shrink-0" />
                    <span>Pause</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || (!schedulerData?.cycleRunning && !schedulerData?.enabled && !schedulerData?.savedPosition)}
                    onClick={handleStopScheduler}
                    className="px-2.5 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold rounded-xl shadow transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Square className="h-3.5 w-3.5 shrink-0" />
                    <span>Stop</span>
                  </button>
                </div>
                <div className="text-xs text-slate-400 text-center">
                  1-click start • Live state updates every 3s
                </div>
              </div>
            </div>

            {/* MARKETING IMAGE UPLOAD CONTROLS FOR SCHEDULED CYCLES */}
            <div className="mt-3 pt-4 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-indigo-500/20">
              <div className="flex items-center gap-3">
                <span className={`p-2.5 rounded-xl border ${
                  imageUploadEnabled
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}>
                  <ImageIcon className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">Scheduled Cycle Image Attachment</span>
                    <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                      imageUploadEnabled
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}>
                      {imageUploadEnabled
                        ? `ACTIVE • ${marketingImages.length} Images (${imageSelectionMode === "cycle" ? "Sequential" : "Random"})`
                        : "PAUSED • Text-Only Mode"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Control whether scheduled multi-account cycles attach 1 marketing graphic per comment or post text-only.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleImageUpload()}
                  disabled={isUpdatingImageSettings}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 cursor-pointer border ${
                    imageUploadEnabled
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                  }`}
                >
                  {imageUploadEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{imageUploadEnabled ? "Pause Images" : "Enable Images"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  disabled={isUploadingImages}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
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
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Image Library ({marketingImages.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* ACTIVE VS BACKUP & MANUAL CHECK NOTICE BANNER */}
          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 flex items-start gap-3">
            <Info className="h-4.5 w-4.5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300 leading-relaxed space-y-1">
              <div>
                <strong className="text-white">Active vs. Backup Accounts:</strong> Check <span className="text-emerald-400 font-semibold font-mono">Use this account for now</span> on the accounts you want to post in the cycle (e.g. 3 primary accounts). Unchecked accounts act as <span className="text-amber-300 font-semibold">Standby / Backup</span>—their login sessions remain safely saved in the cloud, ready to turn on anytime with one click.
              </div>
              <div className="text-[11px] text-slate-400">
                Uploaded marketing images, AI commentary, and human cooldown timers work automatically across all scheduled posting cycles.
              </div>
            </div>
          </div>

          {/* ACCOUNTS SCHEDULE TABLE */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Configured Accounts & Execution Order</span>
                  <span className="text-sm font-normal text-slate-400">
                    ({schedulerData?.accounts?.length || 0} accounts)
                  </span>
                </h4>
                <span className="text-sm text-slate-400">
                  Accounts run strictly sequentially: Account 1, then Account 2, then Account 3.
                </span>
              </div>
              <button
                onClick={() => {
                  handleResetLoginState();
                  setLoginTab("credentials");
                  setShowSessionModal(true);
                }}
                className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shrink-0"
                title="Add or manage CoinMarketCap accounts"
              >
                <Users className="h-4 w-4 text-indigo-400" />
                <span>Manage Accounts</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <th className="py-3 px-4 font-semibold text-center w-24">Order</th>
                    <th className="py-3 px-4 font-semibold">Account</th>
                    <th className="py-3 px-4 font-semibold min-w-[220px]">Use this account for now</th>
                    <th className="py-3 px-4 font-semibold min-w-[200px]">Posting Frequency</th>
                    <th className="py-3 px-4 font-semibold min-w-[180px]">Last Run</th>
                    <th className="py-3 px-4 font-semibold min-w-[150px]">Next Due</th>
                    <th className="py-3 px-4 font-semibold text-center w-32">Session</th>
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
                                {/* Drag grip handle */}
                                <div
                                  title={isSchedulerRunning ? "Reordering is locked while scheduler is running" : "Drag row to reorder"}
                                  className={`p-1 rounded transition ${isSchedulerRunning ? 'cursor-not-allowed opacity-30 text-slate-600' : 'cursor-grab active:cursor-grabbing text-slate-500 hover:text-indigo-400 hover:bg-slate-800'}`}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>

                                {/* Direct position number dropdown */}
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

                                {/* Quick navigation arrows (up / down) */}
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
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                                  {acc.name}
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.2 bg-indigo-500 text-slate-950 text-[9px] font-bold rounded animate-pulse">
                                      RUNNING NOW
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>

                            {/* Checkbox: Use this account for now (Manual weekly checking) */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1 items-start">
                                <label className={`inline-flex items-center gap-2 group select-none ${isSchedulerRunning ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
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
                                    className="h-4.5 w-4.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950 transition cursor-pointer accent-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                  <span className={`text-sm font-semibold transition ${
                                    isCheckedNow ? "text-emerald-300 font-bold" : "text-slate-300 group-hover:text-white"
                                  }`}>
                                    Use this account for now
                                  </span>
                                </label>

                                {/* Contextual status badges */}
                                {acc.schedule.frequency === "weekly" ? (
                                  <div className="pl-6.5">
                                    {acc.schedule.useForNow ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                        <CheckCircle className="h-3 w-3" />
                                        Manually checked for this week
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-amber-300/90 italic flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-amber-400" />
                                        Weekly account: check manually when ready
                                      </span>
                                    )}
                                  </div>
                                ) : acc.schedule.enabled ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/90 pl-6.5 font-mono font-medium">
                                    <CheckCircle className="h-3 w-3 text-emerald-400" />
                                    Active Primary (In cycle)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 pl-6.5 font-medium">
                                    <Shield className="h-3 w-3 text-amber-500/80" />
                                    Standby / Backup (Reserved)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Frequency dropdown & custom input */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <CustomSelect
                                  disabled={isSchedulerRunning}
                                  value={acc.schedule.frequency}
                                  accent="indigo"
                                  menuMinWidth={190}
                                  className="text-slate-100 py-1.5 px-3"
                                  title={isSchedulerRunning ? "Locked while scheduler is running" : "Select posting frequency"}
                                  options={[
                                    { value: "every_cycle", label: "Every cycle" },
                                    { value: "daily", label: "Daily (24h)" },
                                    { value: "weekly", label: "Weekly (Manual check)" },
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
                                      className="w-12 bg-transparent text-sm text-white text-center focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-[10px] text-slate-400">hrs</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Last run (time + status badge + posted/failed) */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1">
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
                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              {acc.schedule.enabled === false ? (
                                <span className="text-slate-500 italic">Disabled</span>
                              ) : acc.schedule.useForNow ? (
                                <span className="text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Due now (Checked)
                                </span>
                              ) : acc.schedule.frequency === "every_cycle" ? (
                                <span className="text-indigo-400 font-semibold">Every cycle</span>
                              ) : acc.schedule.frequency === "weekly" ? (
                                <span className="text-amber-300/80 italic">Check box when ready</span>
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
                            <td className="py-3.5 px-4 text-center">
                              {acc.hasValidSession ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle className="h-3 w-3" />
                                  Valid
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
};

