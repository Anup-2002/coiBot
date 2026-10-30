import React from "react";
import {
  Shield,
  ArrowLeft,
  RefreshCw,
  Lock,
  Bell,
  BellOff,
  Archive,
  Trash2,
  AlertTriangle,
  Pause,
  Cpu,
  Clock,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Copy,
  Share2,
  CheckCircle,
} from "lucide-react";

export function renderAdminPage(navigateTo: any, adminSection: any, setAdminSection: any, adminAuthRequired: any, telegramEnabled: any, retentionDays: any, handleSaveRetentionSettings: any, handlePruneOldData: any, isPruningData: any, isBusy: any, isPostingActive: any, handleToggleTelegram: any, telegramToken: any, telegramChatId: any, handleDetectTelegramChatId: any, isDetectingTelegram: any, handleTestEmergencyAlert: any, isTestingTelegram: any, handleToggleAdminAuth: any, showRevealedAdminPassword: any, setShowRevealedAdminPassword: any, handleCopyPassword: any, currentAdminPassword: any, handleCopyShareLink: any, newAdminPasswordInput: any, setNewAdminPasswordInput: any, handleUpdatePassword: any) {

  return (
        /* ADMIN SETTINGS SCREEN (Strictly Team Security, Telegram Emergency Bot & Data Cleanup Rules — Zero Health or Account Modal Duplication) */
        <main key="view-admin" className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* ADMIN HEADER & NAVIGATION */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Admin Settings
                </h1>
                <p className="text-sm text-slate-400">Team access security, emergency Telegram bot setup, and automatic data cleanup rules</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => navigateTo("dashboard")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* ADMIN 3-CARD MODULE SELECTOR DECK (Zero Overlap with Health or Account Modal) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setAdminSection("security")}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 ${
                adminSection === "security"
                  ? "bg-slate-900 border-amber-500/50 ring-1 ring-amber-500/30 shadow-lg"
                  : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Lock className="h-4 w-4" />
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  adminAuthRequired ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                }`}>
                  {adminAuthRequired ? "LOCKED" : "OPEN"}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">1. Team Security & Password</div>
                <div className="text-xs text-slate-400 mt-0.5">Admin password & 1-click team login link</div>
              </div>
            </button>

            <button
              onClick={() => setAdminSection("telegram")}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 ${
                adminSection === "telegram"
                  ? "bg-slate-900 border-rose-500/50 ring-1 ring-rose-500/30 shadow-lg"
                  : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Bell className="h-4 w-4" />
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  telegramEnabled ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                }`}>
                  {telegramEnabled ? "ON" : "OFF"}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">2. Telegram Emergency Bot</div>
                <div className="text-xs text-slate-400 mt-0.5">Configure @anup_cms_alert_bot & test alerts</div>
              </div>
            </button>

            <button
              onClick={() => setAdminSection("retention")}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 ${
                adminSection === "retention"
                  ? "bg-slate-900 border-blue-500/50 ring-1 ring-blue-500/30 shadow-lg"
                  : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Archive className="h-4 w-4" />
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/20 text-blue-300">
                  {retentionDays} DAYS
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">3. Data & Queue Cleanup</div>
                <div className="text-xs text-slate-400 mt-0.5">Auto-archive old post history ({retentionDays}-day window)</div>
              </div>
            </button>
          </div>

          {/* 3. DATA RETENTION & AUTO-CLEANUP SETTINGS */}
          {adminSection === "retention" && (
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Archive className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-white">Automatic History Cleanup & Retention Policy</h2>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Choose how many days of completed post history to keep before older records are automatically cleaned up.
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 self-start sm:self-auto">
                  KEEPING LAST {retentionDays} DAYS
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-sm font-bold text-white block">Select History Window</span>
                  <p className="text-xs text-slate-400">
                    Completed runs older than this window are automatically removed to keep the app fast.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveRetentionSettings(4, true)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition cursor-pointer ${
                        retentionDays === 4
                          ? "bg-blue-600 text-white border-blue-500 shadow"
                          : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                      }`}
                    >
                      Keep 4 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveRetentionSettings(7, true)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition cursor-pointer ${
                        retentionDays === 7
                          ? "bg-blue-600 text-white border-blue-500 shadow"
                          : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                      }`}
                    >
                      Keep 7 Days (Recommended)
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-sm font-bold text-white block">Manual Cleanup</span>
                    <p className="text-xs text-slate-400 mt-1">
                      Immediately clean up post submissions older than {retentionDays} days without affecting your active queue.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePruneOldData(retentionDays)}
                    disabled={isPruningData || isBusy || isPostingActive}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Trash2 className="h-4 w-4 text-blue-400" />
                    <span>{isPruningData ? "Cleaning Old Records..." : `Clean Records Older Than ${retentionDays} Days`}</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 2. TELEGRAM EMERGENCY ALERTS SYSTEM */}
          {adminSection === "telegram" && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl transition-all duration-350 hover:border-slate-700/80">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <span className={`p-2 rounded-xl border flex items-center justify-center ${
                  telegramEnabled
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-sm shadow-rose-500/10"
                    : "bg-slate-800 text-slate-500 border-slate-700"
                }`}>
                  <Bell className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-white text-base">Emergency Telegram Alerts (Critical Stops Only)</h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                      telegramEnabled ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-slate-800 text-slate-400"
                    }`}>
                      {telegramEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Sends an instant Telegram message only when human action is needed (e.g., all accounts sign out or a scheduled run stops).
                  </p>
                </div>
              </div>

              {/* Telegram Master Toggle */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleTelegram(!telegramEnabled)}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all duration-150 active:scale-[0.98] shadow-md cursor-pointer ${
                    telegramEnabled
                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  }`}
                  title={telegramEnabled ? "Click to disable Emergency Telegram Alerts" : "Click to enable Emergency Telegram Alerts"}
                >
                  {telegramEnabled ? (
                    <>
                      <Bell className="h-3.5 w-3.5 text-white" />
                      <span>Telegram Alerts: ON (Disable)</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="h-3.5 w-3.5 text-slate-400" />
                      <span>Telegram Alerts: OFF (Enable)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Alert Level Filter Notice */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 mb-5">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm space-y-1.5">
                  <div className="font-bold text-slate-200">Anti-Spam & Emergency Filtering Protocol Active</div>
                  <p className="text-slate-400 leading-relaxed">
                    To prevent hitting Telegram rate limits and avoid buzzing your phone unnecessarily, routine operations run completely silent in the background. The emergency alert fires exclusively under critical conditions:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                      <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> All Accounts Session Out (Circuit Breaker)
                      </span>
                      <span className="text-slate-400">Triggered if all accounts in the 24-part background cycle fail authentication or have expired cookies, halting all automated posting.</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                      <span className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                        <Pause className="h-3.5 w-3.5" /> Continuous Posting Loop Aborted
                      </span>
                      <span className="text-slate-400">Triggered if continuous loop is killed due to 3 consecutive failures or expired active credentials requiring manual login.</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                      <span className="font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                        <Cpu className="h-3.5 w-3.5" /> Deployment & Build Failures
                      </span>
                      <span className="text-slate-400">Triggered if frontend compilation or server bundling fails during deployment, alerting you immediately with failure details.</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                        <Clock className="h-3.5 w-3.5" /> 20-Min Cooldown & Rate Capping
                      </span>
                      <span className="text-slate-400">Identical error alerts are throttled with a 20-minute cooldown and a hard ceiling of 6 emergency alerts/hour to protect your chat.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Telegram Bot Details & Testing */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Connected Bot</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-white">@anup_cms_alert_bot</span>
                  <a
                    href="https://t.me/anup_cms_alert_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-1 truncate">Token: {telegramToken.slice(0, 14)}...</div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Recipient Chat ID</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-emerald-400">{telegramChatId || "Not detected"}</span>
                    <button
                      onClick={handleDetectTelegramChatId}
                      disabled={isDetectingTelegram}
                      className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${isDetectingTelegram ? "animate-spin" : ""}`} />
                      <span>{isDetectingTelegram ? "Detecting..." : "Re-Detect"}</span>
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Direct private channel to your Telegram app</div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Verify Emergency Hotline</span>
                <button
                  onClick={handleTestEmergencyAlert}
                  disabled={isTestingTelegram || !telegramEnabled}
                  className="w-full py-2 px-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow"
                >
                  <Bell className="h-3.5 w-3.5" />
                  <span>{isTestingTelegram ? "Dispatching..." : "Send Test Emergency Alert"}</span>
                </button>
                <div className="text-[10px] text-slate-500 mt-1 text-center font-mono">Bypasses throttle for manual testing</div>
              </div>
            </div>
          </section>
          )}

          {/* 4. COMPANY ADMIN ACCESS & TEAM SHARING CARD */}
          {adminSection === "security" && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl transition-all duration-350 hover:border-slate-700/80 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Key className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Company Admin Credentials & Access Management
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Team Access
                    </span>
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Manage the company admin password, copy 1-click access links for team members, and configure protection.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleAdminAuth(!adminAuthRequired)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminAuthRequired
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  }`}
                  title="Toggle password requirement on dashboard"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{adminAuthRequired ? "Password Gate: Enabled" : "Password Gate: Disabled"}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Column: Current Credentials & 1-Click Share */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <span className="text-sm font-bold uppercase font-mono text-slate-300 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    Current Admin Password
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRevealedAdminPassword(!showRevealedAdminPassword)}
                      className="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
                    >
                      {showRevealedAdminPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      <span>{showRevealedAdminPassword ? "Hide" : "Show"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="text-sm text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy Password</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="font-mono text-base font-bold text-white tracking-wider">
                    {showRevealedAdminPassword ? currentAdminPassword : "•".repeat(Math.max(8, currentAdminPassword.length || 8))}
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                    Active Passcode
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-sm font-bold uppercase font-mono text-slate-300 flex items-center gap-1.5">
                    <Share2 className="h-4 w-4 text-indigo-400" />
                    Shareable 1-Click Team Access Link
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Share this URL with company operators. Anyone with this link is automatically authenticated without typing passwords:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type={showRevealedAdminPassword ? "text" : "password"}
                      readOnly
                      value={`${window.location.origin}/?key=${encodeURIComponent(currentAdminPassword)}`}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyShareLink}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition flex items-center gap-1.5 flex-shrink-0 cursor-pointer shadow-md shadow-indigo-600/20"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Link</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Change Admin Password */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="border-b border-slate-800/60 pb-3">
                  <span className="text-sm font-bold uppercase font-mono text-slate-300 flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-amber-400" />
                    Update Admin Password
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Set a new password for company administrators. The 1-click shareable link will automatically update to use the new password.
                </p>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                      New Admin Password
                    </label>
                    <input
                      type="text"
                      value={newAdminPasswordInput}
                      onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                      placeholder="Enter at least 3 characters..."
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-base text-white placeholder-slate-600 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleUpdatePassword}
                    disabled={!newAdminPasswordInput.trim() || newAdminPasswordInput.trim().length < 3}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-slate-950" />
                    <span>Save New Password</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
          )}

          </main>
  );
};

