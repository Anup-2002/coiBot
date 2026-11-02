import React from "react";
import { Play, Clock, RefreshCw, ChevronRight, ChevronDown, Layers, Trash2, Square, Activity, Lock, Settings, Zap, Globe, Search, Pause, Upload, Image as ImageIcon, Shuffle, Bell, BellOff, CheckCircle, FileText, AlertTriangle, ExternalLink } from "lucide-react";
import { PostResult } from "../types";
import { formatTimeAgo } from "../utils/ui-helpers";
import { CycleCountdown } from "../components/CycleCountdown";

const CollapsibleSection: React.FC<{
  className?: string;
  headerLeft: (expanded: boolean, toggle: () => void) => React.ReactNode;
  headerRight: React.ReactNode;
  children: React.ReactNode;
  alwaysVisibleBottom?: React.ReactNode;
}> = ({ className = "", headerLeft, headerRight, children, alwaysVisibleBottom }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        {headerLeft(expanded, () => setExpanded((prev) => !prev))}
        {headerRight}
      </div>
      {expanded && children}
      {alwaysVisibleBottom}
    </div>
  );
};

export function renderDashboardControlPanel(status: string, navigateTo: any, isBusy: any, isPostingActive: any, schedulerData: any, toggleNotifications: any, notificationsEnabled: any, isSchedulerRunning: any, imageUploadEnabled: any, marketingImages: any, imageSelectionMode: any, handleToggleImageUpload: any, isUpdatingImageSettings: any, imageFileInputRef: any, isUploadingImages: any, setActiveTab: any, setInlineConfirmModal: any, runCommand: any, isPending: any, activeProfile: any, profilesList: any, sessionExists: any, dailyPostCount: any, coinsList: any, messagesList: any, postedCount: any, failedCount: any, setIsExternalImportModalOpen: any, totalCoins: any, isContinuousLoopActive: any, showToast: any, isStoppingPost: any, generatedCount: any, activeProcess: any, activeProcessDescription: any, setShowConfirmFetchModal: any, coinsFetchedAt: any, setShowConfirmGenerateModal: any, commentsGeneratedAt: any, setIsStoppingPost: any, isDataOlderThan2Days: any, setShowStaleWarningModal: any, setIsStartingPost: any, isStartingPost: any, handleRefreshFreshData: any, isRefreshingFreshData: any, continuousInterval: any, toggleContinuousLoop: any, setContinuousInterval: any, saveIntervalToServer: any, nextCycleStartTime: any, activeImageIndex: any, activeProfileIdRef: any, results: any, progressIndex: any, currentCoin: any, dailyPostLimit: any) {
  const activePid = activeProfileIdRef.current || activeProfile?.id;
  const profileResults = results.filter((r: any) => !activePid || !r.profileId || r.profileId === activePid);
  const batchGenTime = commentsGeneratedAt || coinsFetchedAt || 0;
  const activeBatchTotal = generatedCount > 0 ? generatedCount : (totalCoins > 0 ? totalCoins : 0);
  const normSym = (s?: string) => String(s || "").replace(/^\$/, "").trim().toLowerCase();
  const isCurBatchResult = (r: PostResult) => {
    if (activeBatchTotal === 0 || !batchGenTime) return false;
    const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
    return !isNaN(rTime) && rTime >= (batchGenTime - 120000);
  };
  const curBatchResults = profileResults.filter(isCurBatchResult);
  const postedSymsInBatch = new Set(
    curBatchResults.filter((r: PostResult) => r.status === "success").map((r: PostResult) => normSym(r.symbol)).filter(Boolean)
  );
  const satisfiedQueueCount = messagesList.length > 0
    ? messagesList.filter((m: any) => postedSymsInBatch.has(normSym(m.symbol))).length
    : coinsList.filter((c: any) => postedSymsInBatch.has(normSym(c.symbol))).length;
  const verifiedBatchSuccessCount = Math.max(
    curBatchResults.filter((r: PostResult) => r.status === "success").length,
    satisfiedQueueCount
  );
  const verifiedBatchFailedCount = curBatchResults.filter(
    (r: PostResult) => r.status !== "success" && r.status !== "skipped" && !postedSymsInBatch.has(normSym(r.symbol))
  ).length;
  const displayPostedCount = curBatchResults.length > 0 ? verifiedBatchSuccessCount : Math.min(postedCount, activeBatchTotal);
  const displayFailedCount = curBatchResults.length > 0 ? verifiedBatchFailedCount : failedCount;
  const clampedProgress = Math.min(
    curBatchResults.length > 0 ? verifiedBatchSuccessCount : Math.max(postedCount, progressIndex),
    activeBatchTotal
  );
  const batchPercent = activeBatchTotal > 0 ? Math.min(100, Math.max(0, Math.round((clampedProgress / activeBatchTotal) * 100))) : 0;
  const remainingBatch = Math.max(0, activeBatchTotal - clampedProgress);
  const isBatchCompleted = activeBatchTotal > 0 && remainingBatch === 0 && displayPostedCount >= activeBatchTotal;
  const firstUnpostedCoin = messagesList.find((m: any) => !postedSymsInBatch.has(normSym(m.symbol))) || coinsList.find((c: any) => !postedSymsInBatch.has(normSym(c.symbol)));
  const nextQueuedSymbol = isBatchCompleted
    ? null
    : (firstUnpostedCoin?.symbol || coinsList[Math.min(progressIndex, Math.max(0, activeBatchTotal - 1))]?.symbol || messagesList[Math.min(progressIndex, Math.max(0, activeBatchTotal - 1))]?.symbol);
  const todayStartMs = new Date().setHours(0, 0, 0, 0);
  const resultsPostedToday = profileResults.filter((r: PostResult) => {
    if (r.status !== "success") return false;
    const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
    return !isNaN(rTime) && rTime >= todayStartMs;
  }).length;
  const effectiveDailyPostCount = Math.max(dailyPostCount || 0, resultsPostedToday);

  return (
    <>
        {/* PRIMARY FEATURE SPOTLIGHT: 24/7 MULTI-ACCOUNT AUTO-SCHEDULER */}
        <section className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-emerald-950/60 border border-indigo-500/40 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30 shrink-0 shadow-md">
                <Clock className={`h-6 w-6 ${schedulerData?.cycleRunning ? "text-emerald-400 animate-spin" : "text-indigo-300"}`} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 text-[11px] font-mono font-bold uppercase tracking-wider shrink-0">
                    Main Feature
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    24/7 Multi-Account Auto-Scheduler
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold uppercase shrink-0 ${
                    schedulerData?.cycleRunning
                      ? "bg-emerald-400 text-slate-950 animate-pulse"
                      : schedulerData?.enabled
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                  }`}>
                    {schedulerData?.cycleRunning
                      ? "Cycle Running Now"
                      : schedulerData?.enabled
                        ? "24/7 Active"
                        : "Standby"}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300">
                  Automatically fetches live trending coins, splits them evenly across your active accounts ({(schedulerData?.accounts || []).filter(a => a.schedule?.enabled).length || profilesList.length || 0} active), and posts in sequence every {Math.round((schedulerData?.intervalMinutes || 360) / 60)} hours ({schedulerData?.dailyCycleCount || 0}/{schedulerData?.maxCyclesPerDay || 4} cycles today).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {schedulerData?.nextCycleAt && !schedulerData?.cycleRunning && (
                <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300">
                  Next Run: <strong className="text-emerald-400">{new Date(schedulerData.nextCycleAt).toLocaleTimeString()}</strong>
                </div>
              )}
              <button
                type="button"
                onClick={() => navigateTo("scheduler")}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-400 hover:to-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-indigo-500/20 transition flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Clock className="h-4 w-4 text-slate-950" />
                <span>Open 24/7 Scheduler</span>
                <ChevronRight className="h-4 w-4 text-slate-950" />
              </button>
            </div>
          </div>
        </section>

        {/* ROW 1: ACTIONS & ACTIVE PROGRESS */}
        <div className="dashboard-grid-row">
          
          {/* CONTROL PANEL CARD (7 cols) */}
          <section id="controls-panel" className="lg:col-span-7 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700/80 relative overflow-hidden group h-full">
            {/* Ambient subtle decorative glow */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              {/* HEADER BAR */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shadow-sm shadow-blue-500/10 shrink-0">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-bold text-white text-base tracking-tight truncate">
                      Control Center
                    </h2>
                    <p className="text-xs text-slate-400 truncate">Automated CoinMarketCap Commenting</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={toggleNotifications}
                    className={`text-xs font-bold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] px-2.5 py-1.5 rounded-xl border cursor-pointer ${
                      notificationsEnabled
                        ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
                    }`}
                    title={notificationsEnabled ? "In-app toast alerts are ON. Click to mute." : "In-app toast alerts are muted. Click to turn ON."}
                  >
                    {notificationsEnabled ? (
                      <Bell className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <span>{notificationsEnabled ? "Alerts: ON" : "Alerts: OFF"}</span>
                  </button>

                  <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 shadow-sm">
                    <span className={`w-2 h-2 rounded-full ${
                      status === "Posting" ? "bg-emerald-400 animate-ping" :
                      status === "Stopping" || isStoppingPost ? "bg-amber-400 animate-spin" :
                      status === "Generating" ? "bg-purple-400 animate-pulse" :
                      status === "Fetching" ? "bg-blue-400 animate-pulse" :
                      status === "Authenticating" ? "bg-amber-400 animate-pulse" :
                      (totalCoins > 0 && generatedCount > 0) ? "bg-emerald-400" : "bg-slate-500"
                    }`} />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                      {status === "Stopping" || isStoppingPost
                        ? "Stopping"
                        : status !== "Idle"
                          ? status
                          : isBatchCompleted
                            ? "Completed"
                            : (totalCoins > 0 && generatedCount > 0)
                              ? "Ready"
                              : "Standby"}
                    </span>
                  </div>
                </div>
              </div>

              {/* COMPACT ACCOUNT & QUEUE BAR */}
              <div className="mb-3.5 px-3.5 py-2 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-slate-400 font-mono inline-flex items-center gap-2 flex-wrap min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate">
                    Account: <strong className="text-emerald-400">{activeProfile?.name || (sessionExists ? "Active" : "Not Logged In")}</strong>
                  </span>
                  {activeProfile?.communityProfileUrl && (
                    <a
                      href={activeProfile.communityProfileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold inline-flex items-center gap-1 transition whitespace-nowrap"
                      title={`Open ${activeProfile.cmcUsername || activeProfile.name} on CoinMarketCap Community to verify posted comments`}
                    >
                      @{activeProfile.cmcNickname || activeProfile.cmcUsername} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) {
                      showToast("Cannot clear queue while an active process is running. Please stop the active process first.", "warning");
                      return;
                    }
                    setInlineConfirmModal({
                      isOpen: true,
                      title: "Clear Active Account Queue",
                      message: "Clear queued trending coins, generated comments, and activity logs for this account? Your posted submission history and cookies will remain safe.",
                      onConfirm: () => runCommand("/api/clear-all", "clear")
                    });
                  }}
                  disabled={isPending.clear || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                  className={`text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] px-2.5 py-1 rounded-lg border shrink-0 ${
                    (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning)
                      ? "bg-slate-900 text-slate-500 border-slate-800 opacity-50 cursor-not-allowed"
                      : "text-red-400/90 hover:text-red-300 bg-slate-900 hover:bg-red-500/10 border-slate-800 hover:border-red-500/20 cursor-pointer"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  id="btn-clear-stats"
                  title={
                    (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning)
                      ? "Locked: Stop the active bot process before clearing the queue"
                      : "Clear current queue data"
                  }
                >
                  {(isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) ? (
                    <>
                      <Lock className="h-3 w-3 text-amber-400" />
                      <span>Locked</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3 w-3" />
                      <span>{isPending.clear ? "Clearing..." : "Clear Queue"}</span>
                    </>
                  )}
                </button>
              </div>

              {/* ACTIVE PROCESS MUTEX BANNER */}
              {activeProcess && activeProcess !== "none" && (
                <div className="mb-3 px-3.5 py-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-between text-sm text-indigo-300 shadow-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
                    <span className="truncate text-xs">
                      <strong className="text-white font-semibold">Process Active:</strong> {activeProcessDescription || activeProcess}
                    </span>
                  </div>
                  <span className="text-xs font-mono uppercase bg-indigo-500/20 px-2 py-0.5 rounded font-bold border border-indigo-500/30 shrink-0">
                    Locked
                  </span>
                </div>
              )}

              {/* 2x2 MODERN ACTION DECK - BALANCED ICON + STACKED TEXT + STATUS PILL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                {/* 1. Check Login */}
                <button
                  onClick={() => runCommand("/api/check-login", "login")}
                  disabled={isPending.login || isBusy || isContinuousLoopActive}
                  className="action-grid-btn min-h-[74px] h-full p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800/90 hover:border-emerald-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between gap-2.5 group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-login"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500/20 border border-emerald-500/20 transition shrink-0">
                      <CheckCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition leading-tight">
                        1. Check Login
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-tight mt-1">
                        Verify account session
                      </p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap inline-flex items-center gap-1 shrink-0 ${
                    isPending.login || status === "Authenticating"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : sessionExists
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  }`}>
                    {isPending.login && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {isPending.login || status === "Authenticating"
                      ? "Checking..."
                      : sessionExists
                        ? "Signed In"
                        : "Sign In"}
                  </span>
                </button>

                {/* 2. Fetch Coins */}
                <button
                  onClick={async () => {
                    if (coinsList.length > 0 || totalCoins > 0) {
                      setShowConfirmFetchModal(true);
                    } else {
                      await runCommand("/api/fetch-trending", "fetch");
                    }
                  }}
                  disabled={isPending.fetch || isPending.clear || isBusy || isContinuousLoopActive}
                  className="action-grid-btn min-h-[74px] h-full p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800/90 hover:border-blue-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between gap-2.5 group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-fetch"
                  title={coinsFetchedAt ? `Fetched: ${formatTimeAgo(coinsFetchedAt).full}` : "Fetch latest trending coins from CoinMarketCap"}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl group-hover:bg-blue-500/20 border border-blue-500/20 transition shrink-0">
                      <Search className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition leading-tight">
                        2. Fetch Coins
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-tight mt-1">
                        Get live trending coins
                      </p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap inline-flex items-center gap-1 shrink-0 ${
                    isPending.fetch || status === "Fetching"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : totalCoins > 0
                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}>
                    {isPending.fetch && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {isPending.fetch || status === "Fetching"
                      ? "Fetching..."
                      : `${totalCoins} Coins`}
                  </span>
                </button>

                {/* 3. Write Comments */}
                <button
                  onClick={async () => {
                    if (coinsList.length === 0 && totalCoins === 0) {
                      showToast("Cannot generate comments: Trending coins list is empty. Please fetch trending data first.", "error");
                      return;
                    }
                    if (messagesList.length > 0 || generatedCount > 0) {
                      setShowConfirmGenerateModal(true);
                    } else {
                      await runCommand("/api/generate-messages", "generate");
                    }
                  }}
                  disabled={isPending.generate || isBusy || isContinuousLoopActive}
                  className="action-grid-btn min-h-[74px] h-full p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800/90 hover:border-purple-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between gap-2.5 group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-generate"
                  title={commentsGeneratedAt ? `Generated: ${formatTimeAgo(commentsGeneratedAt).full}` : "Write AI comments for each coin"}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl group-hover:bg-purple-500/20 border border-purple-500/20 transition shrink-0">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition leading-tight">
                        3. Write Comments
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-tight mt-1">
                        Generate AI commentary
                      </p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap inline-flex items-center gap-1 shrink-0 ${
                    isPending.generate || status === "Generating"
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                      : generatedCount > 0
                        ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}>
                    {isPending.generate && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {isPending.generate || status === "Generating"
                      ? "Writing..."
                      : `${generatedCount} Ready`}
                  </span>
                </button>

                {/* 4. Start / Stop Posting */}
                {(status === "Posting" || status === "Stopping" || isContinuousLoopActive || isStoppingPost) ? (
                  <button
                    onClick={() => {
                      setIsStoppingPost(true);
                      runCommand("/api/stop-posting", "post");
                    }}
                    disabled={isPending.post}
                    className="action-grid-btn min-h-[74px] h-full p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between gap-2.5 group disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                    id="btn-pause"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`p-2.5 rounded-xl border transition shrink-0 ${
                        (isStoppingPost || status === "Stopping")
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse"
                      }`}>
                        {(isStoppingPost || status === "Stopping") ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-amber-300" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white leading-tight">
                          {(isStoppingPost || status === "Stopping") ? "Stopping..." : "4. Stop Posting"}
                        </h3>
                        <p className="text-[11px] text-rose-300/80 leading-tight mt-1">
                          {(isStoppingPost || status === "Stopping") ? "Finishing current coin..." : "Halt active sequence"}
                        </p>
                      </div>
                    </div>
                    {(isStoppingPost || status === "Stopping" || isPending.post) ? (
                      <span className="text-[11px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full font-bold border border-amber-500/30 flex items-center gap-1 shrink-0 whitespace-nowrap">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Stopping
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono uppercase bg-rose-500/20 px-2.5 py-1 rounded-full font-bold border border-rose-500/30 shrink-0 whitespace-nowrap">
                        Posting
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (coinsList.length === 0 && totalCoins === 0) {
                        showToast("Cannot start posting: Trending coins list is empty. Please fetch trending data first.", "error");
                        return;
                      }
                      if (messagesList.length === 0 && generatedCount === 0) {
                        showToast("Cannot start posting: Generated comments are empty. Please generate comments first.", "error");
                        return;
                      }
                      if (isDataOlderThan2Days()) {
                        setShowStaleWarningModal(true);
                        return;
                      }
                      setIsStartingPost(true);
                      await runCommand("/api/post-chat", "post");
                    }}
                    disabled={isPending.post || isStartingPost || isBusy || isContinuousLoopActive}
                    className="action-grid-btn min-h-[74px] h-full p-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between gap-2.5 group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                    id="btn-start"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 group-hover:scale-105 transition-transform shrink-0">
                        {isStartingPost ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                        ) : (
                          <Play className="h-4 w-4 fill-emerald-400" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition leading-tight">
                          {isStartingPost ? "Starting..." : "4. Start Posting"}
                        </h3>
                        <p className="text-[11px] text-slate-400 leading-tight mt-1">
                          Post comments to CMC
                        </p>
                      </div>
                    </div>
                    <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap inline-flex items-center gap-1 shrink-0 ${
                      totalCoins > 0 && generatedCount > 0
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}>
                      {(isStartingPost || isPending.post) && <RefreshCw className="h-3 w-3 animate-spin" />}
                      {isStartingPost || isPending.post
                        ? "Starting..."
                        : isBatchCompleted
                          ? "Completed"
                          : totalCoins > 0 && generatedCount > 0
                            ? `${remainingBatch} Left`
                            : "Need Queue"}
                    </span>
                  </button>
                )}
              </div>

              {/* Dedicated Stale Market Data Warning Banner Row */}
              {isDataOlderThan2Days() && status !== "Posting" && status !== "Stopping" && !isContinuousLoopActive && (
                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-sm text-amber-300 shadow-sm animate-fadeIn">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-sm block text-amber-200">Market Data Over 2 Days Old</span>
                      <span className="text-[11px] text-amber-400/80 block truncate">
                        Refresh trending coins and comments before posting.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRefreshFreshData(false)}
                    disabled={isRefreshingFreshData || isBusy}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-sm transition shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isRefreshingFreshData ? "Refreshing..." : "Refresh Now"}
                  </button>
                </div>
              )}
            </div>

            {/* FULL AUTOMATION SEQUENCE & COLLAPSIBLE DROPDOWN CARDS */}
            <div className="mt-4 pt-3 flex flex-col gap-2.5 relative z-10">
              <button
                onClick={() => runCommand("/api/full-flow", "full", { continuous: isContinuousLoopActive, intervalMinutes: continuousInterval })}
                disabled={isPending.full || isBusy || isContinuousLoopActive || isSchedulerRunning}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 transition-all duration-150 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-[0.98] flex items-center justify-center gap-2 font-black text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                id="btn-full-flow"
                title={
                  (isBusy || isContinuousLoopActive || isSchedulerRunning)
                    ? "Locked while another bot or scheduler process is active"
                    : "Fetch trending coins, write AI comments, and start posting in one click"
                }
              >
                {isPending.full ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Running Full Automated Cycle...</span>
                  </>
                ) : (isBusy || isContinuousLoopActive || isSchedulerRunning) ? (
                  <>
                    <Lock className="h-4 w-4 text-slate-950 shrink-0" />
                    <span className="truncate">Fetch, Write &amp; Post All</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 fill-slate-950" />
                    <span>Fetch, Write &amp; Post All</span>
                  </>
                )}
              </button>

              {/* AUTO-REPEAT MODE (DROPDOWN TO CONFIGURE WAIT TIME BEFORE ENABLING, LOCKED WHILE ACTIVE) */}
              <CollapsibleSection
                className={`px-3.5 py-2.5 rounded-xl border flex flex-col gap-2.5 shadow-inner transition-all duration-150 ${
                  isContinuousLoopActive
                    ? "bg-emerald-950/30 border-emerald-500/40"
                    : "bg-slate-950/60 border-slate-800/60"
                }`}
                headerLeft={(expanded, toggle) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                    title="Click to show or hide wait timer settings"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      isContinuousLoopActive ? "bg-emerald-400 animate-ping" : "bg-slate-500"
                    }`} />
                    <span className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-white transition">
                      Auto-Repeat Mode
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                      isContinuousLoopActive
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}>
                      {isContinuousLoopActive ? `ACTIVE • ${continuousInterval}m` : `OFF • ${continuousInterval}m`}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 group-hover:text-slate-200 font-semibold px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "rotate-180 text-emerald-400" : ""}`} />
                    </span>
                  </button>
                )}
                headerRight={
                  <button
                    type="button"
                    id="chk-continuous"
                    disabled={(isBusy && !isContinuousLoopActive) || isSchedulerRunning}
                    onClick={() => toggleContinuousLoop(!isContinuousLoopActive, continuousInterval)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
                      isContinuousLoopActive
                        ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40"
                        : "bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {isContinuousLoopActive ? (
                      <>
                        <Square className="h-3 w-3" />
                        <span>Stop Repeat</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-emerald-400" />
                        <span>Enable Repeat</span>
                      </>
                    )}
                  </button>
                }
                alwaysVisibleBottom={
                  isContinuousLoopActive ? (
                    <CycleCountdown nextCycleStartTime={nextCycleStartTime} />
                  ) : null
                }
              >
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">
                      {isContinuousLoopActive
                        ? "Wait timer locked while active (Stop Repeat to change):"
                        : "Set wait time between rounds before enabling:"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[5, 15, 30, 60].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={isContinuousLoopActive || isSchedulerRunning}
                          onClick={() => {
                            setContinuousInterval(preset);
                            saveIntervalToServer(preset);
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                            continuousInterval === preset
                              ? "bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20"
                              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80"
                          } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
                        >
                          {preset}m
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min="5"
                      max="120"
                      disabled={isContinuousLoopActive || isSchedulerRunning}
                      value={continuousInterval}
                      onChange={(e) => setContinuousInterval(Math.max(5, Number(e.target.value)))}
                      onMouseUp={() => saveIntervalToServer(continuousInterval)}
                      onTouchEnd={() => saveIntervalToServer(continuousInterval)}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      id="slider-interval"
                    />
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      disabled={isContinuousLoopActive || isSchedulerRunning}
                      value={continuousInterval}
                      onChange={(e) => {
                        const val = Math.max(5, Number(e.target.value));
                        setContinuousInterval(val);
                        saveIntervalToServer(val);
                      }}
                      className="w-12 bg-slate-900 border border-slate-800/80 rounded-lg px-1.5 py-0.5 text-center text-[10px] font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50 shadow-inner disabled:opacity-40 disabled:cursor-not-allowed"
                      id="num-interval"
                    />
                  </div>
                </div>
              </CollapsibleSection>

              {/* MARKETING IMAGES (DROPDOWN TO UPLOAD / IMPORT / MANAGE ANYTIME) */}
              <CollapsibleSection
                className={`px-3.5 py-2.5 rounded-xl border flex flex-col gap-2.5 shadow-inner transition-all duration-150 ${
                  imageUploadEnabled
                    ? "bg-indigo-950/25 border-indigo-500/40"
                    : "bg-slate-950/60 border-slate-800/60"
                }`}
                headerLeft={(expanded, toggle) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                    title="Click to show or hide image upload & library tools"
                  >
                    <span className={`p-1.5 rounded-lg border shrink-0 ${imageUploadEnabled ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" : "bg-slate-900 text-slate-400 border-slate-800"}`}>
                      <ImageIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-white transition">
                      Marketing Images
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                      imageUploadEnabled
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}>
                      {imageUploadEnabled ? `ACTIVE • ${marketingImages.length}` : `PAUSED • ${marketingImages.length}`}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 group-hover:text-slate-200 font-semibold px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "rotate-180 text-indigo-400" : ""}`} />
                    </span>
                  </button>
                )}
                headerRight={
                  <button
                    type="button"
                    onClick={() => handleToggleImageUpload(!imageUploadEnabled)}
                    disabled={isUpdatingImageSettings}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                      imageUploadEnabled
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm"
                        : "bg-slate-900 hover:bg-slate-800 text-indigo-300 border-indigo-500/30"
                    }`}
                    id="chk-image-upload"
                  >
                    {imageUploadEnabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    <span>{imageUploadEnabled ? "Pause Images" : "Enable Images"}</span>
                  </button>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => imageFileInputRef.current?.click()}
                    disabled={isUploadingImages}
                    className="py-1.5 px-3 bg-emerald-600/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isUploadingImages ? "Uploading..." : "Upload Images"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExternalImportModalOpen(true)}
                    className="py-1.5 px-3 bg-teal-600/15 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Import from Link</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("images");
                      document.getElementById("storage-explorer")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="py-1.5 px-3 bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Image Library ({marketingImages.length})</span>
                  </button>
                </div>
              </CollapsibleSection>
            </div>
          </section>

          {/* ACTIVE PROGRESS / EXECUTION MONITOR (5 cols) */}
          <section className="lg:col-span-5 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700/80 relative overflow-hidden group h-full">
            {/* Ambient subtle decorative glow */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-3.5 relative z-10 flex-1 flex flex-col justify-between">
              <div className="space-y-3.5">
                {/* HEADER */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                      <Activity className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="font-bold text-white text-base tracking-tight">Progress</h2>
                      <p className="text-xs text-slate-400">Live Batch Metrics</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1 rounded-xl border border-slate-800 shadow-sm">
                    <span className={`w-2 h-2 rounded-full ${
                      status === "Stopping" || isStoppingPost ? "bg-amber-400 animate-spin" :
                      status !== "Idle" ? "bg-emerald-400 animate-pulse" :
                      (totalCoins > 0 && generatedCount > 0) ? "bg-emerald-400" : "bg-slate-500"
                    }`} />
                    <span className="text-xs font-mono text-slate-200 font-semibold uppercase">
                      {status === "Stopping" || isStoppingPost
                        ? "Halting"
                        : status !== "Idle"
                          ? status
                          : isBatchCompleted
                            ? "Completed"
                            : (totalCoins > 0 && generatedCount > 0)
                              ? "Queue Ready"
                              : "Standby"}
                    </span>
                  </div>
                </div>

                {/* CURRENT COIN SPOTLIGHT CARD */}
                <div className="spotlight-asset-card min-h-[84px] p-4 bg-slate-950/80 rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-between shadow-inner">
                  <div className="space-y-1 min-w-0 pr-3">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block font-bold">
                      Current Coin &amp; Status
                    </span>
                    <div className="text-lg font-black text-white font-mono tracking-tight flex items-center gap-2 flex-wrap">
                      {status === "Stopping" || isStoppingPost ? (
                        <span className="text-amber-400 flex items-center gap-1.5 text-base font-bold">
                          <RefreshCw className="h-4 w-4 animate-spin" /> Stopping Engine...
                        </span>
                      ) : isStartingPost ? (
                        <span className="text-emerald-400 flex items-center gap-1.5 text-base font-bold">
                          <RefreshCw className="h-4 w-4 animate-spin" /> Starting Engine...
                        </span>
                      ) : status === "Fetching" ? (
                        <span className="text-blue-400 flex items-center gap-1.5 text-base font-bold">
                          <RefreshCw className="h-4 w-4 animate-spin" /> Fetching Coins...
                        </span>
                      ) : status === "Generating" ? (
                        <span className="text-purple-400 flex items-center gap-1.5 text-base font-bold">
                          <RefreshCw className="h-4 w-4 animate-spin" /> Writing AI Comments...
                        </span>
                      ) : currentCoin !== "N/A" ? (
                        currentCoin
                      ) : activeBatchTotal > 0 && clampedProgress >= activeBatchTotal ? (
                        <span className="text-emerald-400 text-base font-bold">Batch Complete ({clampedProgress}/{activeBatchTotal} Posted)</span>
                      ) : activeBatchTotal > 0 && progressIndex >= activeBatchTotal && remainingBatch > 0 ? (
                        <span className="text-amber-400 text-base font-bold">Run Finished ({clampedProgress}/{activeBatchTotal} Posted)</span>
                      ) : nextQueuedSymbol ? (
                        <span className="text-emerald-300 text-base font-bold">Next: ${nextQueuedSymbol}</span>
                      ) : activeBatchTotal > 0 ? (
                        <span className="text-emerald-300 text-base font-bold">Ready ({remainingBatch} Queued)</span>
                      ) : (
                        <span className="text-slate-400 text-base font-bold">Queue Empty</span>
                      )}
                      {status === "Posting" && currentCoin !== "N/A" && (
                        <span className="text-xs font-sans font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          In Progress
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-mono block truncate">
                      {status === "Stopping" || isStoppingPost
                        ? "Finishing current coin before stopping..."
                        : isStartingPost
                        ? "Opening CoinMarketCap browser..."
                        : status === "Posting"
                        ? `Posting #${Math.min(progressIndex + 1, activeBatchTotal || 1)} of ${activeBatchTotal || 0}`
                        : activeBatchTotal > 0 && clampedProgress >= activeBatchTotal
                        ? `All ${activeBatchTotal} coins posted on CoinMarketCap`
                        : progressIndex > 0 && activeBatchTotal > 0
                        ? `Paused at #${progressIndex} of ${activeBatchTotal}`
                        : activeBatchTotal > 0
                        ? `${activeBatchTotal} coins ready in queue`
                        : "Click '2. Fetch Coins' to load trending coins"}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-3xl font-black font-mono tabular-nums text-emerald-400 tracking-tight">
                      {batchPercent}%
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono uppercase font-semibold">Done</span>
                  </div>
                </div>

                {/* CLEAN SYMMETRIC 2x2 (4-CARD) KPI GRID */}
                <div className="grid grid-cols-2 gap-2.5 items-stretch">
                  <div className="kpi-stat-box p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase font-semibold">Total Coins</span>
                    <div className="text-xl font-black text-slate-100 font-mono tabular-nums mt-1">{totalCoins}</div>
                  </div>

                  <div className="kpi-stat-box p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase font-semibold">AI Ready</span>
                    <div className="text-xl font-black text-purple-400 font-mono tabular-nums mt-1">{generatedCount}</div>
                  </div>

                  <div className="kpi-stat-box p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-mono text-slate-400 uppercase font-semibold">Posted</span>
                      {displayFailedCount > 0 && (
                        <span className="text-[10px] font-mono text-rose-400 font-bold">
                          {displayFailedCount} Failed
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-black text-emerald-400 font-mono tabular-nums mt-1">{displayPostedCount}</div>
                  </div>

                  <div className="kpi-stat-box p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase font-semibold">Remaining</span>
                    <div className="text-xl font-black text-amber-400 font-mono tabular-nums mt-1">{remainingBatch}</div>
                  </div>
                </div>

                {totalCoins > 0 && generatedCount > 0 && totalCoins !== generatedCount && (
                  <div className="p-2.5 bg-indigo-950/40 border border-indigo-800/40 rounded-xl flex items-center justify-between text-[11px] font-mono text-indigo-300">
                    <span>Queue has {generatedCount} comments vs {totalCoins} coins.</span>
                    <button
                      onClick={() => setShowConfirmGenerateModal(true)}
                      disabled={isPending.generate || isBusy}
                      className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 text-[10px] font-bold transition cursor-pointer"
                    >
                      Sync Comments
                    </button>
                  </div>
                )}

                {effectiveDailyPostCount >= dailyPostLimit && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-semibold">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 animate-pulse text-rose-400" />
                    <span>Daily limit reached ({effectiveDailyPostCount}/{dailyPostLimit} posts today). Resets at 00:00 UTC.</span>
                  </div>
                )}
              </div>

              {/* BOTTOM PROGRESS BAR & CLEAN FOOTER */}
              <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-400">Batch Progress</span>
                    <span className="text-emerald-400 font-bold">
                      {clampedProgress} / {activeBatchTotal} {generatedCount > 0 && generatedCount !== totalCoins ? "comments" : "coins"}
                    </span>
                  </div>

                  <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                    <div
                      className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out shadow-sm shadow-emerald-500/30"
                      style={{ width: `${batchPercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-mono text-slate-400 pt-0.5">
                  <span>
                    Success Rate:{" "}
                    <strong className="text-slate-200 font-semibold">
                      {displayPostedCount + displayFailedCount > 0
                        ? `${Math.round((displayPostedCount / (displayPostedCount + displayFailedCount)) * 100)}%`
                        : "—"}
                    </strong>
                  </span>
                  <span title="Daily safety cap resets automatically every day at 00:00 UTC">
                    Today&apos;s Cap:{" "}
                    <strong className={effectiveDailyPostCount >= dailyPostLimit ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold"}>
                      {effectiveDailyPostCount}
                    </strong>{" "}
                    / {dailyPostLimit}
                  </span>
                </div>
              </div>
            </div>
          </section>

        </div>

    </>
  );
}
