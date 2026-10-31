import React from "react";
import { Play, Database, Clock, RefreshCw, ChevronRight, ExternalLink, Image as ImageIcon, CheckCircle, FileText, AlertTriangle, RotateCcw, Download, Archive } from "lucide-react";
import { PostResult } from "../types";
import { resolveUrl, formatTimeAgo } from "../utils/ui-helpers";

export function renderDashboardDataExplorer(retentionDays: any, isBusy: any, isPostingActive: any, isSchedulerRunning: any, imageUploadEnabled: any, marketingImages: any, setActiveTab: any, activeProfile: any, coinsList: any, messagesList: any, isRefreshingData: any, handleManualRefresh: any, activeTab: any, isContinuousLoopActive: any, showToast: any, coinsFetchedAt: any, commentsGeneratedAt: any, activeProfileIdRef: any, results: any, setSubmissionsViewMode: any, submissionsViewMode: any, setShowRetentionSettingsModal: any, setShowResetQueueConfirm: any, isResettingDailyQueue: any, handleRetrySingle: any, individualLoading: any, handleCopyAndOpenCMC: any, imageLibraryNode: any) {
  return (
        <section id="storage-explorer" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 shrink-0">
                  <Database className="h-5 w-5" />
                </span>
                <span>Campaign Data, Reports &amp; Image Library</span>
              </h2>

              <button
                onClick={handleManualRefresh}
                disabled={isRefreshingData}
                className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-sm font-bold border border-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Refresh trending coins, generated comments, and submission results"
              >
                <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isRefreshingData ? "animate-spin" : ""}`} />
                <span>Refresh Data</span>
              </button>
            </div>

            {/* Exporter selector tabs */}
            <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab("coins")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === "coins" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Trending Coins ({coinsList.length})
              </button>
              <button
                onClick={() => setActiveTab("comments")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === "comments" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. Generated Comments ({messagesList.length})
              </button>
              <button
                onClick={() => setActiveTab("results")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === "results" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {(() => {
                  const activePid = activeProfileIdRef.current || activeProfile?.id;
                  const count = results.filter(r => !activePid || !r.profileId || r.profileId === activePid).length;
                  return `3. Post Submissions (${count})`;
                })()}
              </button>
              <button
                onClick={() => setActiveTab("reports")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === "reports" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                4. CSV Exports &amp; Reports
              </button>
              <button
                onClick={() => setActiveTab("images")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "images" ? "bg-indigo-600/50 text-white border border-indigo-500/50 shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span>5. Image Library ({marketingImages.length})</span>
                <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${imageUploadEnabled ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                  {imageUploadEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* TAB WINDOW CONTENT */}
          <div className="min-h-[200px]">
            
            {/* TAB 1: COINS LIST */}
            {activeTab === "coins" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm text-slate-400 font-mono">
                      Showing {coinsList.length} trending assets for the active profile
                    </span>
                    {coinsList.length > 0 && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${
                        coinsFetchedAt
                          ? (formatTimeAgo(coinsFetchedAt).isVeryStale
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : formatTimeAgo(coinsFetchedAt).isStale
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20")
                          : "bg-slate-800/80 text-slate-400 border-slate-700/80"
                      }`} title={coinsFetchedAt ? `Exact fetch time: ${formatTimeAgo(coinsFetchedAt).full}` : "Coins loaded from previous session. Click Get trending coins to get fresh coins with live timer."}>
                        <Clock className="h-3 w-3" />
                        {coinsFetchedAt 
                          ? `Fetched: ${formatTimeAgo(coinsFetchedAt).text} (${formatTimeAgo(coinsFetchedAt).full})`
                          : "Fetched: Previous Session (Click Get trending coins to update)"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                  <table className="w-full text-left text-sm border border-slate-700/80 border-collapse min-w-[900px]">
                    <thead className="bg-slate-950 text-slate-300 uppercase text-xs tracking-wider border-b border-slate-700/80 font-mono font-bold">
                      <tr>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Rank</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Slug / Asset</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Price</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">1h Change</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">24h Change</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">7d Change</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Market Cap</th>
                        <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">24h Volume</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Interactive Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                      {coinsList.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 px-4 text-center text-slate-400">
                            <div className="space-y-3 max-w-md mx-auto">
                              <p className="text-slate-500 font-medium">No trending coins found in storage for this profile.</p>
                              <p className="text-[11px] text-slate-400">
                                If you recently switched profiles, the browser data might not have synchronized yet. Click <strong>"Refresh Coins"</strong> above, or trigger <strong>"Get trending coins"</strong> in the Control Center to populate.
                              </p>
                              <button
                                onClick={handleManualRefresh}
                                disabled={isRefreshingData}
                                className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                                Refresh Now
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        coinsList.map((coin, index) => (
                          <tr key={index} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                            <td className="py-3.5 px-4 font-mono font-semibold text-slate-400 border-r border-slate-800/80">
                              #{coin.cmc_rank || index + 1}
                            </td>
                            <td className="py-3.5 px-4 border-r border-slate-800/80">
                              <div className="font-bold text-white leading-none">{coin.name}</div>
                              <span className="text-[10px] font-mono text-slate-500 tracking-wide uppercase">{coin.symbol}</span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-200 border-r border-slate-800/80">
                              ${coin.price >= 1 ? coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : coin.price.toFixed(6)}
                            </td>
                            <td className={`py-3.5 px-4 font-mono font-semibold border-r border-slate-800/80 ${
                              (coin.change_1h || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}>
                              {(coin.change_1h || 0) >= 0 ? "+" : ""}{(coin.change_1h || 0).toFixed(2)}%
                            </td>
                            <td className={`py-3.5 px-4 font-mono font-semibold border-r border-slate-800/80 ${
                              coin.change_24h >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}>
                              {coin.change_24h >= 0 ? "+" : ""}{coin.change_24h.toFixed(2)}%
                            </td>
                            <td className={`py-3.5 px-4 font-mono font-semibold border-r border-slate-800/80 ${
                              (coin.change_7d || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}>
                              {(coin.change_7d || 0) >= 0 ? "+" : ""}{(coin.change_7d || 0).toFixed(2)}%
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300 border-r border-slate-800/80">
                              ${coin.market_cap.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300 border-r border-slate-800/80">
                              ${coin.volume_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <a
                                href={coin.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 hover:underline inline-flex items-center gap-1 font-semibold"
                              >
                                Open Market <ChevronRight className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: GENERATED COMMENTS */}
            {activeTab === "comments" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm text-slate-400 font-mono">
                      Showing {messagesList.length} AI-generated comments for the active profile
                    </span>
                    {messagesList.length > 0 && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${
                        commentsGeneratedAt
                          ? (formatTimeAgo(commentsGeneratedAt).isVeryStale
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : formatTimeAgo(commentsGeneratedAt).isStale
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-purple-500/10 text-purple-400 border-purple-500/20")
                          : "bg-slate-800/80 text-slate-400 border-slate-700/80"
                      }`} title={commentsGeneratedAt ? `Exact generation time: ${formatTimeAgo(commentsGeneratedAt).full}` : "Comments loaded from previous session. Click Write comments to generate fresh commentary with live timer."}>
                        <Clock className="h-3 w-3" />
                        {commentsGeneratedAt 
                          ? `Generated: ${formatTimeAgo(commentsGeneratedAt).text} (${formatTimeAgo(commentsGeneratedAt).full})`
                          : "Generated: Previous Session (Click Write comments to update)"}
                      </span>
                    )}
                  </div>
                </div>

                {messagesList.length === 0 ? (
                  <div className="p-12 bg-slate-950/60 border border-slate-800 rounded-2xl text-center text-slate-400 space-y-3">
                    <div className="text-slate-500 font-medium">No generated comments found in storage for this profile.</div>
                    <div className="text-sm text-slate-400 max-w-md mx-auto">
                      Comments must be generated before they can be posted. Click <strong className="text-emerald-400">"Refresh Data"</strong> above, or trigger <strong className="text-purple-400">"Write comments"</strong> in the Control Center.
                    </div>
                    <button
                      onClick={handleManualRefresh}
                      disabled={isRefreshingData}
                      className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                      Refresh Now
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                    <table className="w-full text-left text-sm border border-slate-700/80 border-collapse min-w-[750px]">
                      <thead className="bg-slate-950 text-slate-300 uppercase text-xs tracking-wider border-b border-slate-700/80 font-mono font-bold">
                        <tr>
                          <th className="py-3 px-4 w-[100px] border-r border-slate-700/80 whitespace-nowrap">Sequence</th>
                          <th className="py-3 px-4 w-[160px] border-r border-slate-700/80 whitespace-nowrap">Asset</th>
                          <th className="py-3 px-4 w-[120px] border-r border-slate-700/80 whitespace-nowrap">Sentiment</th>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Generated Comment Message</th>
                          <th className="py-3 px-4 text-right w-[130px] whitespace-nowrap">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                        {messagesList.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                            <td className="py-3.5 px-4 font-mono border-r border-slate-800/80">
                              <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 font-bold">
                                #{index + 1}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-white border-r border-slate-800/80">
                              <div className="leading-none">{item.name}</div>
                              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{item.symbol}</span>
                            </td>
                            <td className="py-3.5 px-4 border-r border-slate-800/80">
                              {item.sentiment === "bearish" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider font-bold">
                                  Bearish
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider font-bold">
                                  Bullish
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300 leading-relaxed italic border-r border-slate-800/80">
                              "{item.message}"
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-400 hover:text-purple-300 hover:underline inline-flex items-center gap-1 font-semibold"
                              >
                                Open <ChevronRight className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SUBMISSION RESULTS */}
            {activeTab === "results" && (() => {
              const activePid = activeProfileIdRef.current || activeProfile?.id;
              const profileResults = results.filter(r => !activePid || !r.profileId || r.profileId === activePid);
              const batchGenTime = commentsGeneratedAt || 0;
              
              const isCurrentBatchResult = (r: PostResult) => {
                if (!batchGenTime) return true;
                const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
                return !isNaN(rTime) && rTime >= (batchGenTime - 120000);
              };

              const currentBatchResults = profileResults.filter(isCurrentBatchResult);
              const matchSymbol = (a?: string, b?: string) => String(a || "").replace(/^\$/, "").trim().toLowerCase() === String(b || "").replace(/^\$/, "").trim().toLowerCase();
              const pendingItems = messagesList.filter(msgItem => !currentBatchResults.some(r => matchSymbol(r.symbol, msgItem.symbol) && r.status === "success"));
              const batchPostedCount = currentBatchResults.filter(r => r.status === "success").length;

              return (
                <div className="space-y-4">
                  {/* Top Bar with Mode Switcher & Actions */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
                        <button
                          onClick={() => setSubmissionsViewMode("current_batch")}
                          className={`px-3 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            submissionsViewMode === "current_batch"
                              ? "bg-emerald-500 text-slate-950 shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Current Cycle Queue ({batchPostedCount}/{messagesList.length})
                        </button>
                        <button
                          onClick={() => setSubmissionsViewMode("all_history")}
                          className={`px-3 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            submissionsViewMode === "all_history"
                              ? "bg-blue-500 text-slate-950 shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          All History ({profileResults.length})
                        </button>
                      </div>
                      <span className="hidden sm:inline-block text-[11px] font-mono text-slate-400 ml-2">
                        {submissionsViewMode === "current_batch" 
                          ? `${pendingItems.length} pending in current cycle`
                          : `Total lifetime submissions log`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(activeProfile?.communityProfileUrl || profileResults[profileResults.length - 1]?.profileUrl) && (
                        <a
                          href={activeProfile?.communityProfileUrl || profileResults[profileResults.length - 1]?.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1.5 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition duration-200 cursor-pointer whitespace-nowrap shrink-0"
                          title={`Open posted account's CoinMarketCap Community Profile (${activeProfile?.cmcUsername || profileResults[profileResults.length - 1]?.cmcUsername || "Active Account"}) to verify all posted comments`}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          CMC Profile (@{activeProfile?.cmcNickname || activeProfile?.cmcUsername || profileResults[profileResults.length - 1]?.cmcUsername || "Active"})
                        </a>
                      )}
                      <button
                        onClick={() => setShowRetentionSettingsModal(true)}
                        className="py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-bold border border-indigo-500/20 flex items-center gap-1.5 transition duration-200 cursor-pointer"
                        title="Configure automatic data retention and completed batch auto-pruning"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Retention & Prune ({retentionDays}d)
                      </button>
                      <button
                        onClick={() => setShowResetQueueConfirm(true)}
                        disabled={isResettingDailyQueue || profileResults.length === 0 || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-bold border border-indigo-500/20 flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer"
                        title={
                          (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning)
                            ? "Locked: Stop the active bot process before archiving or resetting the queue"
                            : "Archive completed submissions into 7-day database and restart queue from Coin #1 (accounts and cookies preserved)"
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Archive & Restart ({profileResults.length})
                      </button>
                    </div>
                  </div>

                  {/* Automated Background Isolation & Compaction Notice Banner */}
                  <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5 text-blue-300">
                      <span className="p-1 bg-blue-500/20 rounded-md text-blue-400 font-bold whitespace-nowrap">⚡ AUTO-CLEANUP</span>
                      <p className="text-[11px] leading-relaxed">
                        Old completed runs are automatically archived after {retentionDays} days to keep your queue fast and clean.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                    <table className="w-full text-left text-sm border border-slate-700/80 border-collapse min-w-[850px]">
                      <thead className="bg-slate-950 text-slate-300 uppercase text-xs tracking-wider border-b border-slate-700/80 font-mono font-bold">
                        <tr>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Time</th>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Asset</th>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Sentiment</th>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Log Status</th>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Execution Message / Details</th>
                          <th className="py-3 px-4 text-center border-r border-slate-700/80 whitespace-nowrap">Interactive Controls</th>
                          <th className="py-3 px-4 text-right whitespace-nowrap">Target Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                        {submissionsViewMode === "all_history" ? (
                          // VIEW MODE: ALL LIFETIME HISTORY
                          profileResults.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 px-4 text-center text-slate-400">
                                <p className="text-slate-500 font-medium">No historical submission records found.</p>
                              </td>
                            </tr>
                          ) : (
                            [...profileResults].reverse().map((histItem, hIdx) => (
                              <tr key={hIdx} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                                <td className="py-3 px-4 font-mono text-slate-400 border-r border-slate-800/80 whitespace-nowrap">
                                  {histItem.timestamp || "N/A"}
                                </td>
                                <td className="py-3 px-4 border-r border-slate-800/80">
                                  <div className="font-bold text-white leading-snug">{histItem.name}</div>
                                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mt-0.5">{histItem.symbol}</span>
                                </td>
                                <td className="py-3 px-4 font-bold border-r border-slate-800/80 whitespace-nowrap">
                                  {(histItem.sentiment || "bullish") === "bearish" ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                                      Bearish
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                      Bullish
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-semibold border-r border-slate-800/80 whitespace-nowrap">
                                  {histItem.status === "success" ? (
                                    <span className="text-emerald-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> Post Submitted
                                    </span>
                                  ) : histItem.status === "skipped" ? (
                                    <span className="text-slate-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                      <AlertTriangle className="h-3.5 w-3.5 text-slate-400 shrink-0" /> Skipped (No Community Page)
                                    </span>
                                  ) : histItem.status === "captcha" ? (
                                    <span className="text-amber-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                      <AlertTriangle className="h-3.5 w-3.5 animate-bounce text-amber-400 shrink-0" /> Captcha
                                    </span>
                                  ) : (
                                    <span className="text-red-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" /> {histItem.status.toUpperCase()}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-slate-300 font-mono text-[11px] max-w-xs truncate border-r border-slate-800/80" title={histItem.message}>
                                  {histItem.message}
                                </td>
                                <td className="py-3 px-4 text-center border-r border-slate-800/80">
                                  <span className="text-slate-600 font-mono text-[11px]">—</span>
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    {(histItem.profileUrl || activeProfile?.communityProfileUrl) && (
                                      <a
                                        href={histItem.profileUrl || activeProfile?.communityProfileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 inline-flex items-center gap-1 font-bold text-xs transition whitespace-nowrap"
                                        title={`Verify on Posted Account Profile (${histItem.cmcUsername || activeProfile?.cmcUsername || "CMC Profile"}): ${histItem.profileUrl || activeProfile?.communityProfileUrl}`}
                                      >
                                        Verify Account <ExternalLink className="h-3 w-3 shrink-0" />
                                      </a>
                                    )}
                                    <a
                                      href={histItem.postUrl || (histItem.url ? `${histItem.url.replace(/#.*$/, "")}${histItem.url.includes("/community/post/") ? "" : "#Community"}` : "#")}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/25 inline-flex items-center gap-1 font-bold text-xs transition whitespace-nowrap"
                                      title="Open posted comment / coin community location on CoinMarketCap"
                                    >
                                      Post Location <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )
                        ) : (
                          // VIEW MODE: CURRENT BATCH QUEUE
                          messagesList.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 px-4 text-center text-slate-400">
                                <div className="space-y-3 max-w-md mx-auto">
                                  <p className="text-slate-500 font-medium">No generated comments loaded for the current cycle.</p>
                                  <p className="text-[11px] text-slate-400">
                                    Click <strong>"Refresh"</strong> above, or trigger <strong>"Write comments"</strong> in the Control Center to populate the queue.
                                  </p>
                                  <button
                                    onClick={handleManualRefresh}
                                    disabled={isRefreshingData}
                                    className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                                    Refresh Now
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            messagesList.map((msgItem, index) => {
                              const item = [...currentBatchResults].reverse().find(r => matchSymbol(r.symbol, msgItem.symbol));
                              const pendingIndex = pendingItems.findIndex(p => matchSymbol(p.symbol, msgItem.symbol));
                              const seqStr = pendingIndex !== -1 ? `Seq #${pendingIndex + 1}` : "";
                            
                              return (
                                <tr key={index} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                                  <td className="py-3.5 px-4 font-mono text-slate-400 border-r border-slate-800/80">
                                    {item ? (item.timestamp || "N/A") : "Pending"}
                                  </td>
                                  <td className="py-3.5 px-4 border-r border-slate-800/80">
                                    <div className="font-bold text-white leading-snug">{msgItem.name}</div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mt-0.5">{msgItem.symbol}</span>
                                  </td>
                                  <td className="py-3.5 px-4 font-bold border-r border-slate-800/80 whitespace-nowrap">
                                    {(item?.sentiment || msgItem.sentiment || "bullish") === "bearish" ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                                        Bearish
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                        Bullish
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 font-semibold border-r border-slate-800/80 whitespace-nowrap">
                                    {!item ? (
                                      isPostingActive ? (
                                        <span className="text-cyan-400 inline-flex items-center gap-1.5 font-medium font-mono whitespace-nowrap">
                                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>
                                          In Queue {seqStr && <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800 font-bold ml-1">{seqStr}</span>}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 inline-flex items-center gap-1.5 font-medium font-mono whitespace-nowrap">
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0"></span>
                                          Pending Run {seqStr && <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 font-bold ml-1">{seqStr}</span>}
                                        </span>
                                      )
                                    ) : item.status === "skipped" ? (
                                      <span className="text-slate-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                        <AlertTriangle className="h-3.5 w-3.5 text-slate-400 shrink-0" /> Skipped (No Community Page)
                                      </span>
                                    ) : item.status === "success" ? (
                                      <span className="text-emerald-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> Post Submitted
                                      </span>
                                    ) : item.status === "captcha" ? (
                                      <span className="text-amber-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                        <AlertTriangle className="h-3.5 w-3.5 animate-bounce text-amber-400 shrink-0" /> Captcha Detected
                                      </span>
                                    ) : item.status === "expired" ? (
                                      <span className="text-rose-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap" title="Account session expired: CoinMarketCap displayed Log In">
                                        <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" /> Login expired — please log in again
                                      </span>
                                    ) : (
                                      <span className="text-red-400 inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" /> {item.status.toUpperCase()}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px] max-w-xs truncate border-r border-slate-800/80" title={item ? item.message : msgItem.message}>
                                    {item ? (
                                      item.message === "Post button text is Log In" ? (
                                        <span className="text-rose-400 font-semibold">Post button said "Log In" (Cookies not logged in)</span>
                                      ) : (
                                        item.message
                                      )
                                    ) : (
                                      `Generated: "${msgItem.message.substring(0, 40)}..."`
                                    )}
                                  </td>
                                  
                                  {/* Manual post retry controls */}
                                  <td className="py-3.5 px-4 text-center border-r border-slate-800/80">
                                    {item && item.status !== "success" ? (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          onClick={() => handleRetrySingle(msgItem.symbol)}
                                          disabled={individualLoading[msgItem.symbol] !== null || isBusy}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold font-mono text-[10px] tracking-wide border border-emerald-500/25 transition flex items-center gap-1 disabled:opacity-50 disabled:hover:bg-emerald-500/10 disabled:hover:text-emerald-400 cursor-pointer"
                                          title="Automatically post this comment on CoinMarketCap"
                                        >
                                          {individualLoading[msgItem.symbol] === "retry" ? (
                                            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                          ) : (
                                            <Play className="h-2.5 w-2.5 fill-current" />
                                          )}
                                          Auto Retry
                                        </button>
                                        <a
                                          href={msgItem.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={() => handleCopyAndOpenCMC(msgItem.url, msgItem.message, msgItem.symbol)}
                                          className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-slate-950 font-bold font-mono text-[10px] tracking-wide border border-blue-500/25 transition flex items-center gap-1 cursor-pointer"
                                          title="Copies comment to clipboard and opens CoinMarketCap to post manually"
                                        >
                                          <ExternalLink className="h-2.5 w-2.5" />
                                          Manual Post
                                        </a>
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 font-mono text-[11px]">—</span>
                                    )}
                                  </td>

                                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center justify-end gap-1.5">
                                      {(item?.profileUrl || activeProfile?.communityProfileUrl) && (
                                        <a
                                          href={item?.profileUrl || activeProfile?.communityProfileUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 inline-flex items-center gap-1 font-bold text-xs transition whitespace-nowrap"
                                          title={`Verify on Posted Account Profile (${item?.cmcUsername || activeProfile?.cmcUsername || "CMC Profile"}): ${item?.profileUrl || activeProfile?.communityProfileUrl}`}
                                        >
                                          Verify Account <ExternalLink className="h-3 w-3 shrink-0" />
                                        </a>
                                      )}
                                      <a
                                        href={item?.postUrl || ((item && item.url) ? `${item.url.replace(/#.*$/, "")}${item.url.includes("/community/post/") ? "" : "#Community"}` : `${(msgItem.url || "").replace(/#.*$/, "")}#Community`)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/25 inline-flex items-center gap-1 font-bold text-xs transition whitespace-nowrap"
                                        title="Open posted comment / coin community location on CoinMarketCap"
                                      >
                                        Post Location <ExternalLink className="h-3 w-3 shrink-0" />
                                      </a>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* TAB 4: CSV EXPORTS & REPORTS */}
            {activeTab === "reports" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-sm text-slate-400 font-mono">
                    Download analytical reports and raw data sheets for external use
                  </span>
                </div>

                <div className="space-y-8">
                {/* 4.1. CSV Exporters Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  
                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Trending Coins CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Complete log report containing details of the top trending assets, dynamic live price changes, ranks, and coin URLs.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/trending_coins.csv")}
                      onClick={() => showToast("Downloading Trending Coins CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Generated Comments CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Complete list of AI-generated comments ready to post on CoinMarketCap.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/generated_comments.csv")}
                      onClick={() => showToast("Downloading Generated Comments CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-purple-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Post Submissions CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Active cycle and recent execution logs representing each individual automated browser posting session.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/post_submissions.csv")}
                      onClick={() => showToast("Downloading Post Submissions CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Overall Report CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        High-level summary representing overall run health, conversion rates, counts, and bot execution parameters.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/overall_report.csv")}
                      onClick={() => showToast("Downloading Overall Audit Report CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-amber-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 w-fit">
                        <Archive className="h-5 w-5 text-indigo-400" />
                      </div>
                      <h3 className="font-bold text-white text-base">Archived Logs CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Lifetime historical records of older pruned batches (&gt;{retentionDays}d), safely preserved for audit compliance.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/archived_submissions.csv")}
                      onClick={() => showToast("Downloading Archived Submissions CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-indigo-400" /> Download Archive
                    </a>
                  </div>

                </div>

                {/* 4.2. Beautiful Interactive Analytics Center */}
                <div className="pt-6 border-t border-slate-800">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Success Rate Pie Chart (Radial SVG Chart) */}
                    <div className="lg:col-span-5 bg-slate-950 p-5 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center space-y-4">
                      <h4 className="font-bold text-white text-sm uppercase tracking-wider text-center">Submission Success Rate</h4>
                      
                      {results.length === 0 ? (
                        <div className="py-12 text-center text-sm text-slate-500 italic">
                          No submissions executed yet to compute analytics.
                        </div>
                      ) : (
                        <div className="flex flex-col items-center space-y-4 w-full">
                          <div className="relative flex items-center justify-center w-36 h-36">
                            {/* SVG Radial Ring */}
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                              {/* Background Circle */}
                              <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="transparent"
                                stroke="#1e293b"
                                strokeWidth="10"
                              />
                              {/* Success Slice */}
                              <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="transparent"
                                stroke="#10b981"
                                strokeWidth="10"
                                strokeDasharray={2 * Math.PI * 40}
                                strokeDashoffset={2 * Math.PI * 40 - (results.filter(r => r.status === "success").length / (results.filter(r => r.status !== "skipped").length || 1)) * (2 * Math.PI * 40)}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-2xl font-extrabold text-white">
                                {Math.round((results.filter(r => r.status === "success").length / (results.filter(r => r.status !== "skipped").length || 1)) * 100)}%
                              </span>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Success</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 w-full text-center">
                            <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40">
                              <div className="text-[10px] text-slate-400 font-medium">Successful</div>
                              <div className="text-base font-bold text-emerald-400 font-mono">
                                {results.filter(r => r.status === "success").length} / {results.filter(r => r.status !== "skipped").length}
                              </div>
                            </div>
                            <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40">
                              <div className="text-[10px] text-slate-400 font-medium">Failed / Skipped</div>
                              <div className="text-base font-bold text-rose-400 font-mono">
                                {results.filter(r => r.status !== "success" && r.status !== "skipped").length} F / {results.filter(r => r.status === "skipped").length} S
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Overall Conversion & Sentiment Health */}
                    <div className="lg:col-span-7 bg-slate-950 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-4">Sentiment & Channel Statistics</h4>
                        
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center text-sm text-slate-400 mb-1.5">
                              <span>Bullish Target Engagement</span>
                              <span className="font-mono text-emerald-400 font-semibold">
                                {messagesList.filter(m => m.sentiment !== "bearish").length} coins
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-400 h-full transition-all duration-500"
                                style={{
                                  width: `${messagesList.length > 0 ? (messagesList.filter(m => m.sentiment !== "bearish").length / messagesList.length) * 100 : 0}%`
                                }}
                              ></div>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center text-sm text-slate-400 mb-1.5">
                              <span>Bearish Target Engagement</span>
                              <span className="font-mono text-rose-400 font-semibold">
                                {messagesList.filter(m => m.sentiment === "bearish").length} coins
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-rose-400 h-full transition-all duration-500"
                                style={{
                                  width: `${messagesList.length > 0 ? (messagesList.filter(m => m.sentiment === "bearish").length / messagesList.length) * 100 : 0}%`
                                }}
                              ></div>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center text-sm text-slate-400 mb-1.5">
                              <span>Total Unique Targets Added</span>
                              <span className="font-mono text-blue-400 font-semibold">
                                {coinsList.length} unique assets
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-blue-400 h-full w-full"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/30 p-3 rounded-xl border border-slate-800/40 text-[11px] text-slate-400 mt-4 leading-relaxed">
                        <span className="font-bold text-slate-200">System Insight:</span> Real-time sentiment categorization uses your generated AI comments database. Keep your CoinMarketCap account signed in for the highest posting success rate.
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )}

          {imageLibraryNode}
          </div>
        </section>
  );
}
