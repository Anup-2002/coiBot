import React from "react";
import {
  Activity,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Database,
  Bell,
  BellOff,
  Server,
  Sparkles,
  Globe,
} from "lucide-react";

export function renderHealthPage(
  checkSystemHealth: any,
  isCheckingSystem: any,
  navigateTo: any,
  healthData: any,
  systemCheckResult: any,
  apiStatus: any,
  storageInfo: any,
  activeProfile: any,
  toggleNotifications: any,
  notificationsEnabled: any
) {
  const isOverallHealthy =
    (!healthData || (healthData?.overall === "ok" && healthData?.healthy !== false)) &&
    (!systemCheckResult || systemCheckResult.success);

  const isOpenAiOk = healthData?.checks?.openai
    ? healthData.checks.openai.status === "ok"
    : Boolean(apiStatus.openai && !apiStatus.openaiError);

  const isCmcOk =
    healthData?.checks?.cmc?.status !== "error" &&
    (!systemCheckResult || systemCheckResult.success);

  const isAccountOk = healthData?.checks?.account?.status === "ok";

  return (
    <main
      key="view-health"
      className="flex-1 p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200"
    >
      {/* Unified Header + Overall Status + Alerts Toggle + Refresh */}
      <div
        className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5 shadow-xl border ${
          isOverallHealthy
            ? "bg-slate-900 border-emerald-500/30"
            : "bg-slate-900 border-rose-500/40"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`p-2.5 rounded-xl border shrink-0 ${
              isOverallHealthy
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
            }`}
          >
            {isOverallHealthy ? (
              <CheckCircle className="h-6 w-6" />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-bold text-white">System Health</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                  isOverallHealthy
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                }`}
              >
                {isOverallHealthy ? "HEALTHY • Everything is working" : "ACTION NEEDED • Needs attention"}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              {isOverallHealthy
                ? "All core services, browser automation, cloud database connections, and active accounts are ready."
                : "One or more system checks require attention. Review the status cards below."}
            </p>
          </div>
        </div>

        {/* Right Controls: Popup Alerts Toggle + Refresh Check */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleNotifications}
            className={`px-3.5 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm whitespace-nowrap ${
              notificationsEnabled
                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
            }`}
            title={
              notificationsEnabled
                ? "Popup notifications are ON. Click to mute."
                : "Popup notifications are OFF. Click to turn ON."
            }
          >
            {notificationsEnabled ? (
              <Bell className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <BellOff className="h-4 w-4 text-amber-400 shrink-0" />
            )}
            <span>{notificationsEnabled ? "Popup Alerts: ON" : "Popup Alerts: OFF"}</span>
          </button>

          <button
            type="button"
            onClick={() => checkSystemHealth(true)}
            disabled={isCheckingSystem}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Refresh system health checks"
          >
            <RefreshCw
              className={`h-4 w-4 text-emerald-400 shrink-0 ${
                isCheckingSystem ? "animate-spin" : ""
              }`}
            />
            <span>{isCheckingSystem ? "Checking..." : "Refresh Check"}</span>
          </button>
        </div>
      </div>

      {/* Symmetric 2x2 Core Service Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Bot Server */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg flex flex-col justify-between gap-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Server className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-white">1. Bot Server</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-mono font-bold text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {healthData?.checks?.server?.message ||
                "Bot server is online and handling automation requests."}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>
              Uptime:{" "}
              <strong className="text-slate-200 font-mono">
                {healthData?.checks?.server?.uptimeSeconds
                  ? `${Math.floor(healthData.checks.server.uptimeSeconds / 60)}m`
                  : "Active"}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => navigateTo("logs")}
              className="text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer inline-flex items-center gap-1 transition"
            >
              <span>View Logs</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 2. AI Comment Writer */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg flex flex-col justify-between gap-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-white">2. AI Comment Writer</span>
              </div>
              {isOpenAiOk ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-mono font-bold text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  ENABLED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs font-mono font-bold text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  FALLBACK
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {healthData?.checks?.openai?.message ||
                "Writes crypto comments automatically for each trending coin."}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>
              Active Engine:{" "}
              <strong className="text-slate-200 font-mono">
                {isOpenAiOk ? "OpenAI (gpt-4o-mini)" : "Gemini Fallback"}
              </strong>
            </span>
            <span
              className={
                healthData?.checks?.openai?.status === "error" || apiStatus.openaiError
                  ? "text-rose-400 font-mono font-bold"
                  : "text-emerald-400 font-mono font-bold"
              }
            >
              {healthData?.checks?.openai?.status === "error" || apiStatus.openaiError
                ? "Quota / Error"
                : "Ready"}
            </span>
          </div>
        </div>

        {/* 3. CoinMarketCap Browser */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg flex flex-col justify-between gap-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Globe className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-white">3. CoinMarketCap Browser</span>
              </div>
              {isCmcOk ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-mono font-bold text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  READY
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs font-mono font-bold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  CHECK NEEDED
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {healthData?.checks?.cmc?.message ||
                "Automated CoinMarketCap browser and trending coin feed are ready."}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>
              Playwright Chromium:{" "}
              <strong className="text-slate-200 font-mono">
                {isCmcOk && (!systemCheckResult || systemCheckResult.launchStatus === "success")
                  ? "Healthy"
                  : "Action Needed"}
              </strong>
            </span>
            <span
              className={
                isCmcOk ? "text-emerald-400 font-mono font-bold" : "text-rose-400 font-mono font-bold"
              }
            >
              {isCmcOk ? "Verified" : "Check Needed"}
            </span>
          </div>
        </div>

        {/* 4. Cloud Storage & Active Session */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg flex flex-col justify-between gap-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Database className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-white">4. Cloud Storage & Account</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-xs font-mono font-bold text-cyan-300">
                <Database className="h-3.5 w-3.5 text-cyan-400" />
                {storageInfo.isMongoConnected ? "CLOUD SYNCED" : "CONNECTED"}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {healthData?.checks?.database?.message ||
                "Accounts, coins, comments, and scheduler progress are saved in the cloud."}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">
              Account:{" "}
              <strong
                className={
                  activeProfile?.name ? "text-emerald-400 font-mono" : "text-amber-400 font-mono"
                }
              >
                {activeProfile?.name || "Not Signed In"}
              </strong>
            </span>
            <span
              className={`shrink-0 font-mono font-bold ${
                isAccountOk ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isAccountOk ? "Session Active" : "Sign In Needed"}
            </span>
          </div>
        </div>
      </div>

      {/* Plain-Sentence Diagnostic Alerts Under Checks That Are Not OK */}
      <div className="space-y-2.5">
        {healthData?.checks?.server && healthData.checks.server.status !== "ok" && (
          <div className="p-4 rounded-xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
            <strong className="text-white mr-2">Server:</strong>
            {healthData.checks.server.message}
          </div>
        )}
        {healthData?.checks?.openai && healthData.checks.openai.status !== "ok" && (
          <div className="p-4 rounded-xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
            <strong className="text-white mr-2">OpenAI:</strong>
            {healthData.checks.openai.message}
          </div>
        )}
        {healthData?.checks?.cmc && healthData.checks.cmc.status !== "ok" && (
          <div className="p-4 rounded-xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
            <strong className="text-white mr-2">CMC Browser:</strong>
            {healthData.checks.cmc.message}
          </div>
        )}
        {(healthData?.checks?.database || healthData?.checks?.db) &&
          (healthData?.checks?.database?.status || healthData?.checks?.db?.status) !== "ok" && (
            <div className="p-4 rounded-xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
              <strong className="text-white mr-2">Database:</strong>
              {healthData?.checks?.database?.message || healthData?.checks?.db?.message}
            </div>
          )}
        {healthData?.checks?.account && healthData.checks.account.status !== "ok" && (
          <div className="p-4 rounded-xl border bg-rose-950/20 border-rose-500/40 text-sm text-slate-200">
            <strong className="text-white mr-2">Account:</strong>
            {healthData.checks.account.message}
          </div>
        )}
      </div>
    </main>
  );
}
