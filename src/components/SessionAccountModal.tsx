import React from "react";
import { Key, RefreshCw, Users, Trash2, Lock, Copy, Globe, X, CheckCircle, FileText, AlertTriangle, Shield, Save } from "lucide-react";
import { apiFetch } from "../api";
import { resolveUrl, parseResponseJson } from "../utils/ui-helpers";

export function renderSessionAccountModal(isContinuousLoopActive: any, switchingProfileId: any, sessionJson: any, setSessionJson: any, showSessionModal: any, setShowSessionModal: any, profilesList: any, newProfileName: any, setNewProfileName: any, newProfileLimit: any, setNewProfileLimit: any, newProfileProxy: any, setNewProfileProxy: any, editingLimitProfileId: any, setEditingLimitProfileId: any, editingLimitValue: any, setEditingLimitValue: any, editingProxyProfileId: any, setEditingProxyProfileId: any, editingProxyValue: any, setEditingProxyValue: any, deletingId: any, setDeletingId: any, showToast: any, loginTab: any, setLoginTab: any, email: any, setEmail: any, password: any, setPassword: any, loginStep: any, setLoginStep: any, otpCode: any, setOtpCode: any, loginStatusMessage: any, setLoginStatusMessage: any, isPostingActive: any, isBusy: any, fetchSessionDetails: any, fetchProfiles: any, handleSaveProfile: any, handleUpdateProfileLimit: any, handleUpdateProfileProxy: any, promptSwitchProfile: any, handleDeleteProfile: any, handleSaveSession: any, handleStartLogin: any, handleSubmitOtp: any, handleCancelLogin: any, handleResetLoginState: any) {
  return (
    <>
      {showSessionModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-sm">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-white text-base tracking-tight">
                    CoinMarketCap Accounts
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sign in, import cookies, or switch between saved accounts
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSessionModal(false);
                  handleResetLoginState();
                }}
                title="Close window"
                aria-label="Close window"
                className="text-slate-400 hover:text-white transition p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 3-Column Segmented Tab Bar (Zero Horizontal Scrollbar) */}
            <div className="px-6 pt-4 pb-3 border-b border-slate-800/80 bg-slate-950/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setLoginTab("credentials");
                    handleResetLoginState();
                  }}
                  disabled={isBusy || isContinuousLoopActive}
                  className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    loginTab === "credentials"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                  }`}
                >
                  <Key className="h-3.5 w-3.5 shrink-0" />
                  <span>Email Login</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 font-mono uppercase">
                    Best
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setLoginTab("cookies")}
                  disabled={isBusy || isContinuousLoopActive}
                  className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    loginTab === "cookies"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>Import Cookies</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginTab("profiles");
                    if (loginStep === "success") {
                      handleResetLoginState();
                    }
                  }}
                  disabled={isBusy || isContinuousLoopActive}
                  className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    loginTab === "profiles"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                  }`}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>Saved Accounts</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300 font-mono">
                    {profilesList.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[68vh] overflow-y-auto space-y-4">

              {loginTab === "credentials" && (
                <div className="space-y-4 text-sm">
                  {loginStep === "idle" && (
                    <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-5 space-y-4 shadow-inner">
                      <div className="flex items-start gap-3 pb-3 border-b border-slate-800/80">
                        <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                          <Shield className="h-4 w-4" />
                        </span>
                        <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                          Sign in with your CoinMarketCap email and password. The bot will log in and save your account session automatically.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs uppercase text-slate-300 font-mono tracking-wider font-bold block">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleStartLogin();
                            }}
                            placeholder="your-email@example.com"
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs uppercase text-slate-300 font-mono tracking-wider font-bold block">
                            Password
                          </label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleStartLogin();
                            }}
                            placeholder="••••••••••••"
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800/80">
                        <span className="text-xs text-slate-400">
                          Already have accounts saved?{" "}
                          <button
                            type="button"
                            onClick={() => setLoginTab("profiles")}
                            className="text-emerald-400 hover:text-emerald-300 font-semibold underline cursor-pointer"
                          >
                            Switch Accounts ({profilesList.length})
                          </button>
                        </span>
                        <div className="flex items-center justify-end gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setShowSessionModal(false);
                              handleResetLoginState();
                            }}
                            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleStartLogin}
                            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition cursor-pointer shadow-lg shadow-emerald-500/15 flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                          >
                            <Key className="h-4 w-4 shrink-0" />
                            <span>Sign In &amp; Save Account</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {loginStep === "authenticating" && (
                    <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="relative">
                        <RefreshCw className="h-10 w-10 text-emerald-400 animate-spin" />
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
                      </div>
                      <div className="space-y-1.5 max-w-sm">
                        <h4 className="font-bold text-white text-base">Processing CoinMarketCap Authentication...</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{loginStatusMessage}</p>
                      </div>
                      <div className="w-full bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 text-[10px] text-slate-400 space-y-1.5 text-left font-mono">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                          <CheckCircle className="h-3 w-3" /> Secure CoinMarketCap browser opened
                        </div>
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                          <CheckCircle className="h-3 w-3" /> Credentials submitted to CoinMarketCap
                        </div>
                        <div className="flex items-center gap-2 text-amber-400 animate-pulse font-semibold">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Saving login session...
                        </div>
                      </div>
                    </div>
                  )}

                  {loginStep === "otp_required" && (
                    <div className="space-y-4">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl space-y-1.5 text-[11px] leading-relaxed">
                        <span className="font-bold text-white flex items-center gap-1">✉️ Action Required: Verification Code</span>
                        <p>{loginStatusMessage}</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-400 font-mono tracking-widest font-bold">6-Digit Email Code (OTP)</label>
                        <input
                          type="text"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="e.g. 123456"
                          maxLength={6}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-center tracking-widest font-mono text-lg text-emerald-400 focus:outline-none focus:border-emerald-500 placeholder-slate-800"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelLogin}
                          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmitOtp}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold"
                        >
                          Confirm & Verify Code
                        </button>
                      </div>
                    </div>
                  )}

                  {loginStep === "success" && (
                    <div className="p-5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 flex flex-col items-center text-center space-y-3.5">
                      <div className="p-3 bg-emerald-500/20 rounded-full border border-emerald-500/30">
                        <CheckCircle className="h-10 w-10 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-white text-base">Authentication Succeeded!</h4>
                        <p className="text-[11px] text-slate-300 max-w-sm">{loginStatusMessage || "Your CoinMarketCap session has been captured and validated successfully."}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full pt-1">
                        <button
                          onClick={() => {
                            setShowSessionModal(false);
                            handleResetLoginState();
                          }}
                          className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Done</span>
                        </button>
                        <button
                          onClick={() => {
                            handleResetLoginState();
                            setLoginTab("credentials");
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Key className="h-4 w-4 shrink-0" />
                          <span>Add Account</span>
                        </button>
                        <button
                          onClick={() => {
                            handleResetLoginState();
                            setLoginTab("profiles");
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Users className="h-4 w-4 shrink-0" />
                          <span>Saved Accounts ({profilesList.length})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {loginStep === "failed" && (
                    <div className="space-y-4">
                      <div className="p-5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400 flex flex-col items-center text-center space-y-3">
                        <AlertTriangle className="h-10 w-10 text-rose-400" />
                        <div className="space-y-1">
                          <h4 className="font-bold text-white text-base">Login Attempt Notice</h4>
                          <p className="text-[11px] text-slate-300 leading-relaxed max-w-sm">{loginStatusMessage}</p>
                        </div>
                      </div>

                      {/* Immediate Session Verification in case cookies saved in background */}
                      <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2 text-center shadow-inner">
                        <p className="text-[11px] text-slate-400">
                          Did your account log in anyway or does your browser have active cookies?
                        </p>
                        <button
                          onClick={async () => {
                            setLoginStatusMessage("Verifying active session on CoinMarketCap with real browser...");
                            setLoginStep("authenticating");
                            try {
                              const res = await apiFetch(resolveUrl("/api/check-login"), { method: "POST" });
                              const data = await parseResponseJson(res, { status: "failed" });
                              if (data.status === "success") {
                                setLoginStep("success");
                                setLoginStatusMessage("Session is 100% active and verified! Account loaded successfully.");
                                fetchSessionDetails();
                                fetchProfiles();
                                showToast("Session verified active! Welcome back.", "success");
                              } else {
                                setLoginStep("failed");
                                setLoginStatusMessage(data.message || "Session could not be verified as active. Please check credentials or paste cookies.");
                              }
                            } catch (e) {
                              setLoginStep("failed");
                              setLoginStatusMessage("Verification check error: " + (e as Error).message);
                            }
                          }}
                          className="w-full py-2.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                        >
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Verify Login Status</span>
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelLogin}
                          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold cursor-pointer transition"
                        >
                          Close
                        </button>
                        <button
                          onClick={handleResetLoginState}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold cursor-pointer transition shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                          <span>Try Again</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {loginTab === "cookies" && (
                <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-5 space-y-4 text-sm text-slate-300 shadow-inner">
                  <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1.5 text-xs leading-relaxed text-slate-400">
                    <span className="font-bold text-white block">How to import cookies manually:</span>
                    1. Sign in to CoinMarketCap in Chrome.<br />
                    2. Use a browser cookie extension (such as "EditThisCookie") to copy your cookies as JSON.<br />
                    3. Optional: set an account label, daily post cap, or proxy below, then paste the JSON.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase text-slate-300 font-mono font-bold">Account Label (Optional)</label>
                      <input
                        type="text"
                        value={newProfileName}
                        disabled={isBusy || isContinuousLoopActive}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder="e.g. Main Account"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500 text-sm disabled:opacity-40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase text-slate-300 font-mono font-bold">Daily Post Limit</label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={newProfileLimit}
                        disabled={isBusy || isContinuousLoopActive}
                        onChange={(e) => setNewProfileLimit(Math.max(1, parseInt(e.target.value) || 500))}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm font-mono disabled:opacity-40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase text-slate-300 font-mono font-bold">Proxy (Optional)</label>
                      <input
                        type="text"
                        value={newProfileProxy}
                        disabled={isBusy || isContinuousLoopActive}
                        onChange={(e) => setNewProfileProxy(e.target.value)}
                        placeholder="http://user:pass@ip:port"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm font-mono disabled:opacity-40 placeholder-slate-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase text-slate-300 font-mono tracking-wider font-bold">Paste exported login cookies</label>
                    <textarea
                      rows={5}
                      value={sessionJson}
                      disabled={isBusy || isContinuousLoopActive}
                      onChange={(e) => setSessionJson(e.target.value)}
                      placeholder='{ "cookies": [ { "name": "session_token", "value": "..." } ] }'
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3 font-mono text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 placeholder-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              {loginTab === "profiles" && (
                <div className="space-y-4 text-sm text-slate-300">
                  {(isBusy || isPostingActive || isContinuousLoopActive) && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300 text-sm font-semibold">
                      <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 animate-pulse" />
                      <span>Process in progress: Posting or background automation is active. Account switching, profile additions, and deletions are locked until you click "Stop Posting".</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <p className="text-xs text-slate-400">
                      Save up to 5 CoinMarketCap account profiles and swap between them seamlessly.
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          handleResetLoginState();
                          setLoginTab("credentials");
                        }}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Locked while process is active" : "Add another account"}
                      >
                        <Key className="h-3.5 w-3.5 shrink-0" />
                        <span>Add Account</span>
                      </button>
                      <button
                        onClick={() => setLoginTab("cookies")}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Locked while process is active" : "Import login cookies"}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span>Import Cookies</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <h4 className="font-bold text-slate-300 font-mono text-xs uppercase tracking-wider">Saved Accounts ({profilesList.length})</h4>
                    {profilesList.length === 0 ? (
                      <div className="p-6 bg-slate-950 border border-slate-800/80 rounded-xl text-center text-slate-400 text-xs">
                        No account profiles saved yet. Add one above to enable fast multi-account switching.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {profilesList.map((p) => (
                          <div
                            key={p.id}
                            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                              p.isActive
                                ? "bg-emerald-500/5 border-emerald-500/30"
                                : "bg-slate-950 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <div className="space-y-1.5 pr-2 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white text-sm truncate">{p.name}</span>
                                {p.isActive && (
                                  <span className="bg-emerald-500/15 text-emerald-400 text-[11px] uppercase px-2 py-0.5 rounded font-mono font-bold">
                                    Active
                                  </span>
                                )}
                                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] uppercase px-2 py-0.5 rounded font-mono font-bold">
                                  Limit: {p.dailyPostLimit || 300}/day
                                </span>
                                {p.proxy && (
                                  <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] px-2 py-0.5 rounded font-mono font-bold truncate max-w-[160px] inline-flex items-center gap-1" title={`Proxy: ${p.proxy}`}>
                                    <Globe className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{p.proxy.replace(/^https?:\/\//, "")}</span>
                                  </span>
                                )}
                                {p.loginStatus === "logged_in" ? (
                                  <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-[11px] uppercase px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                    Logged In
                                  </span>
                                ) : p.loginStatus === "expired" ? (
                                  <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] uppercase px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                                    Logged Out
                                  </span>
                                ) : (
                                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] uppercase px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                    Unverified
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                                <span className="text-xs text-slate-400">
                                  Saved: {new Date(p.updatedAt).toLocaleString()}
                                </span>
                                {editingLimitProfileId === p.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={1}
                                      max={10000}
                                      value={editingLimitValue}
                                      onChange={(e) => setEditingLimitValue(parseInt(e.target.value) || 300)}
                                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono"
                                    />
                                    <button
                                      onClick={() => handleUpdateProfileLimit(p.id, editingLimitValue)}
                                      className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingLimitProfileId(null)}
                                      className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-xs rounded hover:text-white cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingLimitProfileId(p.id);
                                      setEditingLimitValue(p.dailyPostLimit || 300);
                                    }}
                                    disabled={isBusy || isPostingActive || isContinuousLoopActive}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer"
                                  >
                                    Edit Limit
                                  </button>
                                )}

                                {editingProxyProfileId === p.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="http://user:pass@ip:port or empty"
                                      value={editingProxyValue}
                                      onChange={(e) => setEditingProxyValue(e.target.value)}
                                      className="w-44 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono"
                                    />
                                    <button
                                      onClick={() => handleUpdateProfileProxy(p.id, editingProxyValue)}
                                      className="px-2 py-0.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs rounded cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingProxyProfileId(null)}
                                      className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-xs rounded hover:text-white cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingProxyProfileId(p.id);
                                      setEditingProxyValue(p.proxy || "");
                                    }}
                                    disabled={isBusy || isPostingActive || isContinuousLoopActive}
                                    className="text-xs text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer"
                                  >
                                    {p.proxy ? "Edit Proxy" : "Set Proxy"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                              {!p.isActive && (
                                <button
                                  onClick={() => promptSwitchProfile(p)}
                                  disabled={isBusy || isPostingActive || isContinuousLoopActive || switchingProfileId !== null}
                                  className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                                  title={
                                    (isBusy || isPostingActive || isContinuousLoopActive)
                                      ? "Stop active posting before switching accounts"
                                      : `Switch to ${p.name}`
                                  }
                                >
                                  {switchingProfileId === p.id ? (
                                    <>
                                      <RefreshCw className="h-3 w-3 animate-spin text-slate-950" />
                                      <span>Switching...</span>
                                    </>
                                  ) : (isBusy || isPostingActive || isContinuousLoopActive) ? (
                                    <>
                                      <Lock className="h-3 w-3 shrink-0" />
                                      <span>Locked</span>
                                    </>
                                  ) : (
                                    "Switch Account"
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(p.stateJson);
                                  showToast(`Copied login backup for "${p.name}" to clipboard!`, "success");
                                }}
                                className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 cursor-pointer flex items-center gap-1.5"
                              >
                                <Copy className="h-3 w-3 shrink-0" />
                                <span>Copy Backup</span>
                              </button>
                              {deletingId === p.id ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      handleDeleteProfile(p.id);
                                      setDeletingId(null);
                                    }}
                                    disabled={isBusy || isPostingActive || isContinuousLoopActive}
                                    className="py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingId(p.id)}
                                  disabled={isBusy || isPostingActive || isContinuousLoopActive}
                                  className="py-1.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Deletion locked while process is active" : "Delete account"}
                                >
                                  <Trash2 className="h-3 w-3 shrink-0" />
                                  <span>Delete</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer (only for manual cookie tab) */}
            {loginTab === "cookies" && (
              <div className="bg-slate-950 px-5 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowSessionModal(false);
                    handleResetLoginState();
                  }}
                  className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (newProfileName.trim()) {
                      await handleSaveProfile(newProfileName, sessionJson, newProfileLimit, newProfileProxy);
                      setSessionJson("");
                      setShowSessionModal(false);
                    } else {
                      await handleSaveSession();
                    }
                  }}
                  className="py-2 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>Save Account</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
