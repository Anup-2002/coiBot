import React from "react";
import { RefreshCw, AlertCircle, Lock, Eye, EyeOff, Shield } from "lucide-react";

export function renderAdminLoginGate(adminPasswordInput: any, setAdminPasswordInput: any, showAdminPassword: any, setShowAdminPassword: any, adminAuthLoading: any, adminLoginError: any, setAdminLoginError: any, rememberAdminLogin: any, setRememberAdminLogin: any, adminSchedulerStatus: any, handleAdminLogin: any) {
  return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-emerald-500 selection:text-slate-950">
        {/* Subtle decorative background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          {/* Brand header */}
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="inline-flex items-center justify-center p-3.5 bg-gradient-to-tr from-emerald-500/20 to-indigo-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shadow-2xl shadow-emerald-500/10 mb-3 ring-1 ring-emerald-500/20">
              <Shield className="h-8 w-8 text-emerald-400" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              OPERATIONS GATE
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Company Admin Access
            </h1>
            <p className="text-base text-slate-400 mt-1.5">
              Enter the company admin password or use the 1-click team link to manage CoinMarketCap bot operations.
            </p>
          </div>

          {/* Background Engine Status (Informational - Admin access required to control) */}
          <div className="mb-4">
            {adminSchedulerStatus?.enabled || adminSchedulerStatus?.cycleRunning || adminSchedulerStatus?.postingRunning || adminSchedulerStatus?.isContinuousLoopActive ? (
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl shadow-xl space-y-2">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                        <span>24-Hour Scheduler is ACTIVE</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                          {adminSchedulerStatus.cycleRunning ? "Cycle Running" : (adminSchedulerStatus.postingRunning ? "Posting" : "Scheduled 24/7")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {adminSchedulerStatus.nextCycleAt
                          ? `Running 24/7 background cycles. Next automatic cycle: ${new Date(adminSchedulerStatus.nextCycleAt).toLocaleTimeString()}`
                          : "Continuous background bot processes are active 24/7."}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-emerald-400" />
                    Automatic scheduler runs 24/7 until stopped
                  </span>
                  <span className="text-emerald-400 font-mono font-semibold">Protected</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>24-Hr Scheduler: <strong className="text-slate-300">IDLE / STANDBY</strong></span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">Log in to activate</span>
              </div>
            )}
          </div>

          {/* Login Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {adminLoginError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{adminLoginError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold uppercase tracking-wider text-slate-300 mb-2 font-mono">
                  Company Admin Password
                </label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      if (adminLoginError) setAdminLoginError("");
                    }}
                    placeholder="Enter admin password"
                    autoFocus
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 pr-11 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition p-1 cursor-pointer"
                    title={showAdminPassword ? "Hide password" : "Show password"}
                    aria-label={showAdminPassword ? "Hide password" : "Show password"}
                  >
                    {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-400 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberAdminLogin}
                    onChange={(e) => setRememberAdminLogin(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
                  />
                  <span>Remember on this browser</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={adminAuthLoading || !adminPasswordInput.trim()}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 transition duration-200 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {adminAuthLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-slate-950" />
                    <span>Sign In to Dashboard</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-800/80 text-center text-sm text-slate-500">
              Authorized operators only. Contact your organization administrator for access credentials or a direct team link.
            </div>
          </div>

          <div className="text-center mt-6 text-sm text-slate-500 font-mono">
            CoinMarketCap Marketing Portal
          </div>
        </div>
      </div>
  );
}
