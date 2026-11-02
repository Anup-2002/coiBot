import React from "react";
import { Home, Terminal as TerminalIcon, Clock, RefreshCw, Users, Activity, Lock, Settings, BookOpen } from "lucide-react";
import { CustomSelect } from "./CustomSelect";

export function renderHeaderNavbar(isContinuousLoopActive: any, healthData: any, switchingProfileId: any, sessionExists: any, setShowSessionModal: any, profilesList: any, activeProfile: any, currentView: any, navigateTo: any, setLoginTab: any, schedulerData: any, isPostingActive: any, isBusy: any, promptSwitchProfile: any, handleResetLoginState: any) {
  const isSwitchLocked = Boolean(isBusy || isPostingActive || isContinuousLoopActive || switchingProfileId !== null);

  return (
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          {/* Brand & Left Actions */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div
              onClick={() => navigateTo("dashboard")}
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
              title="Go to Dashboard"
            >
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 animate-pulse flex-shrink-0 group-hover:border-emerald-500/40 transition">
                <Activity className="h-5 w-5" />
              </div>
              <div className="shrink-0">
                <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white group-hover:text-emerald-300 transition flex items-center gap-2 whitespace-nowrap">
                  CoinMarketCap Commenting Hub
                </h1>
                <p className="text-[11px] text-slate-400 hidden sm:block whitespace-nowrap">Automated Community Commenting and Growth Driver</p>
              </div>
            </div>
          </div>

          {/* TOP CONTROLS & NAVIGATION ROW */}
          <div className="flex flex-wrap items-center justify-start xl:justify-end gap-1.5 text-sm">
            {/* Home (Dashboard) Button */}
            <button
              type="button"
              onClick={() => navigateTo("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold transition duration-200 cursor-pointer shrink-0 whitespace-nowrap ${
                currentView === "dashboard"
                  ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30 shadow-sm"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Go to Home Dashboard"
              aria-label="Go to Home Dashboard"
              id="navbar-home-btn"
            >
              <Home className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Home</span>
            </button>

            {/* Unified Smart Account + Active Account Split Pill */}
            <div data-select-anchor="true" id="navbar-account-pill" className={`inline-flex items-stretch rounded-xl border shadow-sm overflow-hidden shrink-0 transition ${
              (isBusy || isPostingActive || isContinuousLoopActive)
                ? "border-amber-500/40 bg-slate-900"
                : (activeProfile || sessionExists)
                  ? "border-emerald-500/30 bg-slate-900 hover:border-emerald-500/50"
                  : "border-amber-500/30 bg-slate-900 hover:border-amber-500/50"
            }`}>
              <button
                type="button"
                onClick={() => {
                  handleResetLoginState();
                  setLoginTab("credentials");
                  setShowSessionModal(true);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold transition duration-200 cursor-pointer whitespace-nowrap ${
                  activeProfile || sessionExists
                    ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                }`}
                title={activeProfile ? `Active account: ${activeProfile.name} (Click to manage accounts)` : "Manage CoinMarketCap accounts"}
                id="navbar-login-btn"
              >
                {(isBusy || isPostingActive || isContinuousLoopActive) ? (
                  <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Users className="h-3.5 w-3.5 shrink-0" />
                )}
                {switchingProfileId ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />
                    <span>Switching...</span>
                  </span>
                ) : (
                  <span>
                    {activeProfile?.name
                      ? activeProfile.name.length > 10
                        ? `${activeProfile.name.slice(0, 10)}...`
                        : activeProfile.name
                      : "Account"}
                  </span>
                )}
                {profilesList.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-bold">
                    {profilesList.length}
                  </span>
                )}
              </button>

              {/* Right Half of Split Pill: 1-Click Quick Account Switcher Dropdown */}
              {profilesList.length > 0 && (
                <CustomSelect
                  iconOnly
                  alignToParent
                  value={activeProfile?.id || ""}
                  disabled={isSwitchLocked}
                  accent="emerald"
                  menuMinWidth={0}
                  className={`border-l h-full px-2 rounded-none ${
                    activeProfile || sessionExists
                      ? "border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                      : "border-amber-500/25 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400"
                  }`}
                  title={
                    isSwitchLocked
                      ? "Stop active posting before switching accounts"
                      : activeProfile
                        ? `Active: ${activeProfile.name} — Click to switch account`
                        : "Quick-switch active CoinMarketCap account"
                  }
                  options={profilesList.map((p: any) => ({
                    value: p.id,
                    label: p.name,
                    badge: p.isActive ? "Active" : undefined,
                  }))}
                  onChange={(val) => {
                    const target = profilesList.find((p: any) => String(p.id) === String(val));
                    if (target) promptSwitchProfile(target);
                  }}
                />
              )}
            </div>

            {/* PRIMARY FEATURE: 24/7 Scheduler Screen Link Button */}
            <button
              onClick={() => navigateTo(currentView === "scheduler" ? "dashboard" : "scheduler")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold transition duration-200 cursor-pointer shadow-md shrink-0 whitespace-nowrap ${
                currentView === "scheduler"
                  ? "bg-gradient-to-r from-indigo-600/40 to-emerald-600/30 border-indigo-400 text-white ring-1 ring-indigo-400/40"
                  : schedulerData?.cycleRunning
                    ? "bg-indigo-950/80 border-indigo-400 text-indigo-200 animate-pulse"
                    : "bg-gradient-to-r from-indigo-600/25 to-emerald-600/20 hover:from-indigo-600/35 hover:to-emerald-600/30 border-indigo-500/50 text-indigo-200 hover:text-white"
              }`}
              title="Open 24/7 Auto-Scheduler"
            >
              <Clock className={`h-4 w-4 shrink-0 ${schedulerData?.cycleRunning ? "text-emerald-400 animate-spin" : "text-indigo-300"}`} />
              <span>Scheduler</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                schedulerData?.cycleRunning
                  ? "bg-emerald-400 text-slate-950 animate-pulse"
                  : schedulerData?.enabled
                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
                    : (schedulerData?.status === "paused" || schedulerData?.savedPosition)
                      ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
                      : "bg-indigo-500/30 text-indigo-200 border border-indigo-400/30"
              }`}>
                {schedulerData?.cycleRunning
                  ? "Running"
                  : schedulerData?.enabled
                    ? "Active"
                    : (schedulerData?.status === "paused" || schedulerData?.savedPosition)
                      ? "Paused"
                      : "24/7"}
              </span>
            </button>

            {/* Logs Link Button */}
            <button
              onClick={() => navigateTo(currentView === "logs" ? "dashboard" : "logs")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold transition duration-200 cursor-pointer shrink-0 whitespace-nowrap ${
                currentView === "logs"
                  ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Activity Logs"
            >
              <TerminalIcon className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Logs</span>
            </button>

            {/* Health Link Button */}
            <button
              onClick={() => navigateTo(currentView === "health" ? "dashboard" : "health")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold transition duration-200 cursor-pointer shrink-0 whitespace-nowrap ${
                currentView === "health"
                  ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open System Health"
            >
              <span className={`w-2 h-2 rounded-full inline-block ${!healthData || healthData?.overall === "ok" || healthData?.healthy ? "bg-emerald-400" : "bg-rose-500 animate-pulse"}`} />
              <Activity className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Health</span>
            </button>

            {/* Admin Settings Button */}
            <button
              type="button"
              onClick={() => navigateTo(currentView === "admin" ? "dashboard" : "admin")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold transition duration-200 cursor-pointer shrink-0 whitespace-nowrap ${
                currentView === "admin"
                  ? "bg-blue-600/30 border-blue-500/60 text-blue-300 ring-1 ring-blue-500/30 shadow-sm"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Admin Settings & Password Security"
              aria-label="Admin Settings"
              id="navbar-admin-settings-btn"
            >
              <Settings className={`h-3.5 w-3.5 text-blue-400 shrink-0 transition-transform duration-300 ${currentView === "admin" ? "rotate-90" : "hover:rotate-45"}`} />
              <span>Admin</span>
            </button>

            {/* QUICK START GUIDE BUTTON */}
            <button
              onClick={() => navigateTo(currentView === "guide" ? "dashboard" : "guide")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold transition duration-200 cursor-pointer shrink-0 whitespace-nowrap ${
                currentView === "guide"
                  ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-300 shadow-sm shadow-indigo-500/20"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open User Guide"
            >
              <BookOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span>Guide</span>
            </button>
          </div>
        </div>
      </header>
  );
}
