import React, { useState } from "react";
import {
  Shield,
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
  ChevronDown,
} from "lucide-react";

const CollapsibleTray: React.FC<{
  title: string;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, badge, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-900/60 transition cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm font-bold text-slate-200 truncate">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-mono font-bold text-slate-300 shrink-0">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-150 ${
            open ? "rotate-180 text-white" : ""
          }`}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-2 border-t border-slate-800/80">{children}</div>}
    </div>
  );
};

export function renderAdminPage(
  navigateTo: any,
  adminSection: any,
  setAdminSection: any,
  adminAuthRequired: any,
  telegramEnabled: any,
  retentionDays: any,
  handleSaveRetentionSettings: any,
  handlePruneOldData: any,
  isPruningData: any,
  isBusy: any,
  isPostingActive: any,
  handleToggleTelegram: any,
  telegramToken: any,
  telegramChatId: any,
  handleDetectTelegramChatId: any,
  isDetectingTelegram: any,
  handleTestEmergencyAlert: any,
  isTestingTelegram: any,
  handleToggleAdminAuth: any,
  showRevealedAdminPassword: any,
  setShowRevealedAdminPassword: any,
  handleCopyPassword: any,
  currentAdminPassword: any,
  handleCopyShareLink: any,
  newAdminPasswordInput: any,
  setNewAdminPasswordInput: any,
  handleUpdatePassword: any,
  handleAdminLogout?: any
) {
  return (
    <main
      key="view-admin"
      className="flex-1 p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200"
    >
      {/* Top Header + Compact 3-Tab Switcher + Lock/Logout */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Admin Settings</h1>
              <p className="text-sm text-slate-400">
                Team access security, emergency Telegram alerts, and automatic history cleanup
              </p>
            </div>
          </div>
          {handleAdminLogout && (
            <button
              type="button"
              onClick={handleAdminLogout}
              id="admin-logout-btn"
              title="Lock dashboard and return to Company Admin Password gate"
              className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm whitespace-nowrap self-start sm:self-auto shrink-0"
            >
              <Lock className="h-4 w-4 text-rose-400 shrink-0" />
              <span>Lock / Logout</span>
            </button>
          )}
        </div>

        {/* Compact 3-Tab Pill Switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setAdminSection("security")}
            className={`px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
              adminSection === "security"
                ? "bg-amber-500/10 border-amber-500/50 text-white shadow-sm"
                : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-sm font-bold truncate">1. Team Security</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${
                adminAuthRequired
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {adminAuthRequired ? "LOCKED" : "OPEN"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAdminSection("telegram")}
            className={`px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
              adminSection === "telegram"
                ? "bg-rose-500/10 border-rose-500/50 text-white shadow-sm"
                : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Bell className="h-4 w-4 text-rose-400 shrink-0" />
              <span className="text-sm font-bold truncate">2. Telegram Alerts</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${
                telegramEnabled ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
              }`}
            >
              {telegramEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAdminSection("retention")}
            className={`px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
              adminSection === "retention"
                ? "bg-blue-500/10 border-blue-500/50 text-white shadow-sm"
                : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Archive className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="text-sm font-bold truncate">3. Data Cleanup</span>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/20 text-blue-300 shrink-0">
              {retentionDays} DAYS
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: TEAM SECURITY & PASSWORD */}
      {adminSection === "security" && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5">
              <Key className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Company Admin Password & 1-Click Team Access
                </h2>
                <p className="text-sm text-slate-300">
                  Share the 1-click access link with operators or update the master password.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggleAdminAuth(!adminAuthRequired)}
              className={`px-3 py-1.5 rounded-xl border text-sm font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto shrink-0 ${
                adminAuthRequired
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
              }`}
              title="Toggle password requirement on dashboard"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>{adminAuthRequired ? "Password Gate: Enabled" : "Password Gate: Disabled"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Card: Current Password + 1-Click Link */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="space-y-1.5">
                <span className="text-xs font-mono uppercase text-slate-400 font-bold block">
                  Current Admin Password
                </span>
                <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                  <span className="font-mono text-sm sm:text-base font-bold text-white tracking-wider truncate">
                    {showRevealedAdminPassword
                      ? currentAdminPassword
                      : "•".repeat(Math.max(8, currentAdminPassword.length || 8))}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowRevealedAdminPassword(!showRevealedAdminPassword)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      {showRevealedAdminPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      <span>{showRevealedAdminPassword ? "Hide" : "Show"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs text-emerald-300 font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
                  <Share2 className="h-3.5 w-3.5 text-indigo-400" />
                  1-Click Team Access Link
                </span>
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
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Link</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Card: Change Admin Password */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <span className="text-xs font-mono uppercase text-slate-400 font-bold block">
                  Update Admin Password
                </span>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Set a new password (minimum 3 characters). Your 1-click team link updates automatically.
                </p>
                <input
                  type="text"
                  value={newAdminPasswordInput}
                  onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                  placeholder="Enter new admin password..."
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleUpdatePassword}
                disabled={!newAdminPasswordInput.trim() || newAdminPasswordInput.trim().length < 3}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4 text-slate-950" />
                <span>Save New Password</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: TELEGRAM EMERGENCY ALERTS (Controls First + Collapsible Rules Tray) */}
      {adminSection === "telegram" && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5">
              <Bell className="h-5 w-5 text-rose-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Emergency Telegram Bot (Critical Stops Only)
                </h2>
                <p className="text-sm text-slate-300">
                  Sends a private Telegram message only when all accounts expire or a cycle halts.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggleTelegram(!telegramEnabled)}
              className={`px-3.5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition cursor-pointer shrink-0 self-start sm:self-auto ${
                telegramEnabled
                  ? "bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              }`}
              title={
                telegramEnabled
                  ? "Click to disable Emergency Telegram Alerts"
                  : "Click to enable Emergency Telegram Alerts"
              }
            >
              {telegramEnabled ? (
                <>
                  <Bell className="h-3.5 w-3.5 text-white" />
                  <span>Telegram Alerts: ON</span>
                </>
              ) : (
                <>
                  <BellOff className="h-3.5 w-3.5 text-slate-400" />
                  <span>Telegram Alerts: OFF</span>
                </>
              )}
            </button>
          </div>

          {/* 3 Actionable Telegram Cards First */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  1. Connected Bot
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-mono font-bold text-white truncate">
                    @anup_cms_alert_bot
                  </span>
                  <a
                    href="https://t.me/anup_cms_alert_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-semibold shrink-0"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-mono truncate">
                Token: {telegramToken.slice(0, 14)}...
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  2. Recipient Chat ID
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {telegramChatId || "Not detected"}
                  </span>
                  <button
                    type="button"
                    onClick={handleDetectTelegramChatId}
                    disabled={isDetectingTelegram}
                    className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition inline-flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${isDetectingTelegram ? "animate-spin" : ""}`}
                    />
                    <span>{isDetectingTelegram ? "Detecting..." : "Re-Detect"}</span>
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400">Direct private alert channel</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                3. Verify Hotline
              </span>
              <button
                type="button"
                onClick={handleTestEmergencyAlert}
                disabled={isTestingTelegram || !telegramEnabled}
                className="w-full py-2 px-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>{isTestingTelegram ? "Sending..." : "Send Test Emergency Alert"}</span>
              </button>
            </div>
          </div>

          {/* Collapsible 4-Rule Explanation Tray */}
          <CollapsibleTray
            title="When Do Emergency Alerts Fire?"
            badge="4 Anti-Spam Rules"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-sm">
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> All Accounts Session Expired
                </span>
                <span className="text-slate-400">
                  Fires if every account in the 24/7 rotation has an expired cookie session.
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <span className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                  <Pause className="h-3.5 w-3.5" /> Auto-Repeat Loop Halted
                </span>
                <span className="text-slate-400">
                  Fires if Auto-Repeat stops after 3 consecutive posting failures.
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <span className="font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                  <Cpu className="h-3.5 w-3.5" /> Build or Deployment Error
                </span>
                <span className="text-slate-400">
                  Fires if a production build or server bundle fails during deployment.
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                  <Clock className="h-3.5 w-3.5" /> 20-Min Cooldown Protection
                </span>
                <span className="text-slate-400">
                  Duplicate alerts are throttled for 20 minutes (max 6 alerts/hour).
                </span>
              </div>
            </div>
          </CollapsibleTray>
        </section>
      )}

      {/* TAB 3: DATA RETENTION & CLEANUP */}
      {adminSection === "retention" && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">1. Automatic History Window</span>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  KEEPING {retentionDays} DAYS
                </span>
              </div>
              <p className="text-sm text-slate-300">
                Completed post history older than this window is automatically removed.
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
                <span className="text-sm font-bold text-white block">2. Manual History Cleanup</span>
                <p className="text-sm text-slate-300 mt-1">
                  Immediately prune post submissions older than {retentionDays} days without touching your active queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePruneOldData(retentionDays)}
                disabled={isPruningData || isBusy || isPostingActive}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4 text-blue-400" />
                <span>
                  {isPruningData
                    ? "Cleaning Old Records..."
                    : `Clean Records Older Than ${retentionDays} Days`}
                </span>
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
