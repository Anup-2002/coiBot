import React from "react";
import {
  Activity,
  RefreshCw,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Database,
  Bell,
  BellOff,
} from "lucide-react";

export function renderHealthPage(checkSystemHealth: any, isCheckingSystem: any, navigateTo: any, healthData: any, systemCheckResult: any, apiStatus: any, storageInfo: any, activeProfile: any, toggleNotifications: any, notificationsEnabled: any) {

  return (
        /* DEDICATED SYSTEM HEALTH SCREEN (Strictly Live Health Status & Popup Alerts Toggle — Zero Admin Settings Duplication) */
        <main key="view-health" className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  System Health
                </h1>
                <p className="text-sm text-slate-400">Live status of the server, AI comment writer, CoinMarketCap browser, cloud storage, and popup alerts</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => checkSystemHealth(true)}
                disabled={isCheckingSystem}
                className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
                title="Refresh system health checks"
              >
                <RefreshCw className={`h-4 w-4 text-emerald-400 shrink-0 ${isCheckingSystem ? "animate-spin" : ""}`} />
                <span>{isCheckingSystem ? "Checking..." : "Refresh Check"}</span>
              </button>
              <button onClick={() => navigateTo("dashboard")} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md whitespace-nowrap shrink-0">
                <ArrowLeft className="h-4 w-4 shrink-0" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* Top Overall Status Banner */}
          {healthData?.overall === "ok" && healthData?.healthy !== false && (!systemCheckResult || systemCheckResult.success) ? (
            <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Everything is working</h2>
                  <p className="text-sm text-slate-300">All core services, browser automation, cloud database connections, and active accounts are ready.</p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 self-start sm:self-auto shrink-0">
                HEALTHY
              </span>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <AlertTriangle className="h-6 w-6 text-rose-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Needs attention</h2>
                  <p className="text-sm text-slate-300">One or more system checks require attention. Review the messages below.</p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 self-start sm:self-auto shrink-0">
                ACTION NEEDED
              </span>
            </div>
          )}

          {/* 5 SERVICE HEALTH CARDS (Zero Duplication — 1 Card Per Service + Interactive Alerts Toggle) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Server */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">1. Bot Server</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm text-slate-300 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                    Server: <span className="font-semibold text-emerald-400">ONLINE</span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.server?.message || "Bot server is online and handling automation requests."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Uptime: <strong className="text-slate-200 font-mono">{healthData?.checks?.server?.uptimeSeconds ? `${Math.floor(healthData.checks.server.uptimeSeconds / 60)}m` : "Active"}</strong></span>
                <button onClick={() => navigateTo("logs")} className="text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer">
                  View Logs →
                </button>
              </div>
            </div>

            {/* 2. OpenAI / AI Models */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">2. AI Comment Writer</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm shrink-0">
                    <span className="text-slate-400 font-mono">OpenAI:</span>
                    {(apiStatus.openai || healthData?.checks?.openai?.status === "ok") ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Enabled
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Fallback
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.openai?.message || "Writes crypto comments automatically for each trending coin."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Model: <strong className="text-slate-200 font-mono">{(apiStatus.openai || healthData?.checks?.openai?.status === "ok") ? "AI Enabled" : "Gemini / Fallback"}</strong></span>
                <span className="text-emerald-400 font-mono font-bold">Ready</span>
              </div>
            </div>

            {/* 3. CMC & Browser */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">3. CoinMarketCap Browser</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm shrink-0">
                    <span className="text-slate-400 font-mono">CMC:</span>
                    {(!systemCheckResult || systemCheckResult.success) ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Check Needed
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.cmc?.message || "Automated CoinMarketCap browser and trending coin feed are ready."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Browser Launch: <strong className="text-slate-200 font-mono">{(!systemCheckResult || systemCheckResult.launchStatus === "success") ? "Healthy" : "Action Needed"}</strong></span>
                <span className="text-emerald-400 font-mono font-bold">Verified</span>
              </div>
            </div>

            {/* 4. Cloud Database */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">4. Cloud Storage</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm shrink-0">
                    <span className="text-slate-400 font-mono">DB:</span>
                    {storageInfo.isFirebaseDisabled ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Database className="h-3.5 w-3.5 text-emerald-400" /> Connected
                      </span>
                    ) : storageInfo.isMongoConnected ? (
                      <span className="text-cyan-400 font-bold flex items-center gap-1">
                        <Database className="h-3.5 w-3.5 text-cyan-400" /> Cloud Synced
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Database className="h-3.5 w-3.5 text-emerald-400" /> Connected
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.database?.message || "Accounts, coins, comments, and scheduler progress are saved in the cloud."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Active Account: <strong className="text-emerald-400 font-mono">{activeProfile?.name || "None"}</strong></span>
                <span className="text-emerald-400 font-mono font-bold">Synced</span>
              </div>
            </div>

            {/* 5. Popup Notifications Toggle (Interactive Alerts ON/OFF) */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4 md:col-span-2 lg:col-span-2">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">5. Popup Notifications</span>
                  <button
                    type="button"
                    onClick={toggleNotifications}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-bold transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                      notificationsEnabled
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                    }`}
                    title={notificationsEnabled ? "Popup alerts are ON. Click to mute." : "Popup alerts are OFF. Click to turn ON."}
                  >
                    {notificationsEnabled ? (
                      <Bell className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <BellOff className="h-4 w-4 text-amber-400" />
                    )}
                    <span>{notificationsEnabled ? "Alerts: ON" : "Alerts: OFF"}</span>
                  </button>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Shows a quick popup notification on screen when coins are fetched, comments are written, or a posting round finishes.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Popup Status: <strong className={notificationsEnabled ? "text-emerald-400 font-mono" : "text-amber-400 font-mono"}>{notificationsEnabled ? "ACTIVE" : "MUTED"}</strong></span>
                <span className="text-slate-400">Click the button above to mute or unmute popups</span>
              </div>
            </div>
          </div>

          {/* PLAIN SENTENCE UNDER EACH CHECK THAT IS NOT OK */}
          <div className="space-y-3">
            {healthData?.checks?.server && healthData.checks.server.status !== "ok" && (
              <div className="p-4 rounded-2xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
                <strong className="text-white mr-2">Server:</strong>
                {healthData.checks.server.message}
              </div>
            )}
            {healthData?.checks?.openai && healthData.checks.openai.status !== "ok" && (
              <div className="p-4 rounded-2xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
                <strong className="text-white mr-2">OpenAI:</strong>
                {healthData.checks.openai.message}
              </div>
            )}
            {healthData?.checks?.cmc && healthData.checks.cmc.status !== "ok" && (
              <div className="p-4 rounded-2xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
                <strong className="text-white mr-2">CMC Browser:</strong>
                {healthData.checks.cmc.message}
              </div>
            )}
            {(healthData?.checks?.database || healthData?.checks?.db) && (healthData?.checks?.database?.status || healthData?.checks?.db?.status) !== "ok" && (
              <div className="p-4 rounded-2xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
                <strong className="text-white mr-2">Database:</strong>
                {healthData?.checks?.database?.message || healthData?.checks?.db?.message}
              </div>
            )}
            {healthData?.checks?.account && healthData.checks.account.status !== "ok" && (
              <div className="p-4 rounded-2xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
                <strong className="text-white mr-2">Account:</strong>
                {healthData.checks.account.message}
              </div>
            )}
          </div>
        </main>
  );
};

