import React from "react";
import { Clock, RefreshCw, AlertCircle, Users, Lock, BookOpen, X, BellOff, CheckCircle, AlertTriangle, RotateCcw, Archive, Info } from "lucide-react";
import { formatTimeAgo } from "../utils/ui-helpers";

export function renderModalsLayer(results: any, coinsFetchedAt: any, commentsGeneratedAt: any, isContinuousLoopActive: any, switchingProfileId: any, setIsStartingPost: any, showConfirmFetchModal: any, setShowConfirmFetchModal: any, showConfirmGenerateModal: any, setShowConfirmGenerateModal: any, showStaleWarningModal: any, setShowStaleWarningModal: any, isRefreshingFreshData: any, activeProfile: any, toast: any, inlineConfirmModal: any, setInlineConfirmModal: any, showToast: any, dismissToast: any, toggleNotifications: any, isResettingDailyQueue: any, showResetQueueConfirm: any, setShowResetQueueConfirm: any, handleResetDailyQueue: any, isPruningData: any, retentionDays: any, showRetentionSettingsModal: any, setShowRetentionSettingsModal: any, handlePruneOldData: any, handleSaveRetentionSettings: any, confirmSwitchProfile: any, setConfirmSwitchProfile: any, isPostingActive: any, isBusy: any, isSchedulerRunning: any, handleActivateProfile: any, runCommand: any, handleRefreshFreshData: any) {
  return (
    <>
      {/* CONFIRM FETCH COINS MODAL */}
      {showConfirmFetchModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col justify-between p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-white text-base">
                  Refetch Trending Coins?
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Trending coins have already been fetched. Refetching will clear current trending data, reset generated comments, and clear posting statistics first.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmFetchModal(false)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) {
                    showToast("Cannot reset and refetch while a bot process is running.", "warning");
                    setShowConfirmFetchModal(false);
                    return;
                  }
                  setShowConfirmFetchModal(false);
                  await runCommand("/api/clear-all", "clear", { force: true });
                  await runCommand("/api/fetch-trending", "fetch");
                }}
                disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                className="py-2 px-5 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Yes, Reset & Fetch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM GENERATE COMMENTS MODAL */}
      {showConfirmGenerateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col justify-between p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 flex-shrink-0">
                <BookOpen className="h-6 w-6" />
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-white text-base">
                  Regenerate Comments?
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Comments have already been generated. Regenerating will overwrite existing comments and reset your current posting sequence progress.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmGenerateModal(false)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowConfirmGenerateModal(false);
                  await runCommand("/api/generate-messages", "generate");
                }}
                className="py-2 px-5 bg-purple-500 hover:bg-purple-400 text-slate-950 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Yes, Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET QUEUE / CLEAR SUBMISSIONS CONFIRMATION MODAL */}
      {showResetQueueConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 flex-shrink-0">
                <RotateCcw className="h-6 w-6" />
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-white text-base">
                  Archive Batch & Restart Queue?
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  This resets the queue index back to Coin #1 for <strong>{activeProfile?.name || "the active profile"}</strong>. All completed submission records will be automatically moved into your <strong>7-Day Retention Archive</strong> so no historical results are lost. Your CoinMarketCap logins, cookies, and daily post caps remain 100% intact.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetQueueConfirm(false)}
                disabled={isResettingDailyQueue}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResetDailyQueue(false)}
                disabled={isResettingDailyQueue || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                className="py-2 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResettingDailyQueue ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Archiving & Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Archive & Restart Queue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATA RETENTION & COMPACTION SETTINGS MODAL */}
      {showRetentionSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 flex-shrink-0">
                <Clock className="h-6 w-6" />
              </span>
              <div className="space-y-1 flex-1">
                <h3 className="font-bold text-white text-base">
                  Data Retention & Lifecycle Policy
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Configure how long older trending coins, completed comment batches, and submission logs are kept in active memory.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <label className="text-sm font-bold text-slate-300 block">
                  Keep Active Submission Records For:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveRetentionSettings(4, true)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      retentionDays === 4
                        ? "bg-indigo-500/20 border-indigo-500 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-base">4 Days (Lean & Fast)</div>
                    <div className="text-[11px] text-slate-400 mt-1">Recommended for high-frequency bots running continuous cycles.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveRetentionSettings(7, true)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      retentionDays === 7
                        ? "bg-indigo-500/20 border-indigo-500 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-base">7 Days (Standard)</div>
                    <div className="text-[11px] text-slate-400 mt-1">Preserves one full week of posting data before archiving.</div>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-200">Auto-Archive Completed Batches</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">ENABLED</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  When all comments in a cycle batch (e.g. 70+ posts) are completely posted, the active queue resets automatically so the next cycle starts fresh with zero blockage or slowdown.
                </p>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                <div className="text-sm text-amber-300">
                  <span className="font-bold">Manual Clean Now:</span> Immediately prune records older than {retentionDays} days into the archive.
                </div>
                <button
                  onClick={() => {
                    setShowRetentionSettingsModal(false);
                    handlePruneOldData(retentionDays);
                  }}
                  disabled={isPruningData}
                  className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg transition cursor-pointer whitespace-nowrap ml-3"
                >
                  {isPruningData ? "Pruning..." : "Prune Now"}
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                onClick={() => setShowRetentionSettingsModal(false)}
                className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT SWITCH CONFIRMATION POPUP MODAL */}
      {confirmSwitchProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Confirm Account Switch</h3>
                  <p className="text-sm text-slate-400">Review what happens before switching profiles</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmSwitchProfile(null)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile comparison card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-sm">
              <div className="flex-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase block font-semibold">Current Active Account</span>
                <span className="font-bold text-slate-300 truncate block">{activeProfile?.name || "Default Session"}</span>
              </div>
              <div className="flex-shrink-0 text-emerald-400 px-2 font-mono font-bold text-base">➔</div>
              <div className="flex-1 text-right">
                <span className="text-[10px] text-emerald-500 font-mono uppercase block font-semibold">Target Account</span>
                <span className="font-bold text-emerald-400 truncate block">{confirmSwitchProfile.name}</span>
              </div>
            </div>

            {/* Detailed Explanation of what happens */}
            <div className="space-y-2.5 text-sm text-slate-300">
              <div className="font-semibold text-slate-200 text-sm">Here is what will happen when you switch:</div>
              <ul className="space-y-2 text-[11px] text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">Active Account Session:</strong> Your active login session will switch to <strong>{confirmSwitchProfile.name}</strong>. All posts and actions will use this account.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">Isolated Data Sandbox:</strong> The trending coins list, AI generated comments, and posting queue will switch to <strong>{confirmSwitchProfile.name}</strong>'s isolated workspace.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">No Data Loss / No Leakage:</strong> The data of <strong>{activeProfile?.name || "Current Profile"}</strong> remains safely preserved in Firestore/cloud storage and will be restored when you switch back.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">Continuous Loops & Tasks:</strong> Any scheduled continuous loops will proceed under the newly selected account.</span>
                </li>
              </ul>
            </div>

            {/* Active Process Barrier Warning */}
            {(isBusy || isPostingActive || isContinuousLoopActive) && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-300 text-sm font-semibold animate-pulse">
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span>Posting or background process is running! You must click "Stop Posting" before switching accounts to prevent data corruption.</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfirmSwitchProfile(null)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const targetId = confirmSwitchProfile.id;
                  setConfirmSwitchProfile(null);
                  await handleActivateProfile(targetId);
                }}
                disabled={(isBusy || isPostingActive || isContinuousLoopActive) || switchingProfileId !== null}
                className="py-2.5 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  (isBusy || isPostingActive || isContinuousLoopActive)
                    ? "Stop active posting before switching accounts"
                    : "Switch to selected account"
                }
              >
                {switchingProfileId === confirmSwitchProfile.id ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Switching...</span>
                  </>
                ) : (isBusy || isPostingActive || isContinuousLoopActive) ? (
                  <>
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>Stop Posting First</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Switch Account</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STALE MARKET DATA WARNING MODAL (> 2 DAYS OLD) */}
      {showStaleWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Warning: Market Data Over 2 Days Old</h3>
                  <p className="text-sm text-amber-400/90 font-medium">Trending coins & comments were fetched over 48 hours ago</p>
                </div>
              </div>
              <button
                onClick={() => setShowStaleWarningModal(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Age summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 font-mono uppercase font-bold">Coins Fetched</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {formatTimeAgo(coinsFetchedAt).text}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {formatTimeAgo(coinsFetchedAt).full}
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 font-mono uppercase font-bold">Comments Generated</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {formatTimeAgo(commentsGeneratedAt).text}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {formatTimeAgo(commentsGeneratedAt).full}
                </div>
              </div>
            </div>

            {/* Warning Explanation */}
            <div className="space-y-2 text-sm text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <p className="font-semibold text-slate-200">
                Why we recommend fetching fresh market data:
              </p>
              <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside">
                <li>Crypto prices, percentage gains, and trends shift dramatically in 48 hours.</li>
                <li>Posting comments quoting outdated prices can appear robotic or incorrect to community members.</li>
                <li>Fetching fresh coins ensures your account posts timely, accurate commentary with relevant AI insights.</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                onClick={() => handleRefreshFreshData(false)}
                disabled={isRefreshingFreshData}
                className="flex-1 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingFreshData ? "animate-spin" : ""}`} />
                {isRefreshingFreshData ? "Refreshing Data..." : "Fetch New Data First (Recommended)"}
              </button>
              <button
                onClick={async () => {
                  setShowStaleWarningModal(false);
                  setIsStartingPost(true);
                  await runCommand("/api/post-chat", "post", { force: true });
                }}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium rounded-xl text-sm transition border border-slate-700 cursor-pointer text-center"
              >
                Post Anyway
              </button>
              <button
                onClick={() => setShowStaleWarningModal(false)}
                className="py-2.5 px-3 text-slate-400 hover:text-slate-200 font-medium rounded-xl text-sm transition hover:bg-slate-800/50 cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Floating Toast with Process Indicator, Turn Off toggle, and Dismiss (No persistent history) */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4.5 py-3 rounded-2xl border shadow-2xl bg-slate-900/95 border-slate-800 text-sm text-white max-w-md backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-200">
          {toast.isProcess ? (
            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 flex-shrink-0">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
            </div>
          ) : toast.type === "success" ? (
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 flex-shrink-0">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
          ) : toast.type === "error" ? (
            <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
          ) : toast.type === "warning" ? (
            <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
          ) : (
            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 flex-shrink-0">
              <Info className="h-4 w-4 text-blue-400" />
            </div>
          )}

          <div className="flex-1 pr-1 leading-snug">
            <span className="font-semibold text-slate-100">{toast.message}</span>
            {toast.isProcess && (
              <span className="block text-[10px] text-blue-400 font-mono mt-0.5 animate-pulse">Posting to CoinMarketCap in background...</span>
            )}
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <button
              onClick={toggleNotifications}
              className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 hover:text-white font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Mute toast notifications (you can re-enable anytime from the Alerts: ON/OFF button in Control Center)"
            >
              <BellOff className="h-3 w-3 text-amber-400" />
              <span>Mute Alerts</span>
            </button>
            <button
              onClick={dismissToast}
              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {inlineConfirmModal && inlineConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <h3 className="text-base font-bold text-white">{inlineConfirmModal.title || "Confirm Action"}</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{inlineConfirmModal.message}</p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setInlineConfirmModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = inlineConfirmModal.onConfirm;
                  setInlineConfirmModal(null);
                  fn();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition cursor-pointer shadow-md"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
