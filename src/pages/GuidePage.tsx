import React from "react";
import {
  BookOpen,
  ArrowLeft,
  Users,
  Search,
  Play,
  Clock,
  Zap,
  Activity,
  CheckCircle,
  Shield,
  Image as ImageIcon,
  Upload,
  AlertTriangle,
  Terminal as TerminalIcon,
} from "lucide-react";

export function renderGuidePage(navigateTo: any, handleResetLoginState: any, setLoginTab: any, setShowSessionModal: any, guideStep: any, setGuideStep: any, imageFileInputRef: any, setActiveTab: any, marketingImages: any, isUploadingImages?: boolean) {

  return (
        /* DEDICATED OPERATING GUIDE SCREEN (/guide) */
        <main key="view-guide" className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Beginner & Operating Guide
                </h1>
                <p className="text-sm text-slate-400">
                  Simple step-by-step guide for connecting accounts, writing AI comments, and scheduling 24/7 CoinMarketCap posts
                </p>
              </div>
            </div>
            <button
              onClick={() => navigateTo("dashboard")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md self-start sm:self-auto shrink-0"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
          </div>

          {/* BEGINNER 3-STEP QUICK WORKFLOW BANNER */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold uppercase tracking-wider">
                    New User Quick Start
                  </span>
                  <h3 className="text-base font-bold text-white">
                    How the Bot Works in 3 Simple Steps
                  </h3>
                </div>
                <span className="text-sm text-slate-400">
                  Follow these 3 steps in order for your first run
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step A */}
                <div className="bg-slate-950/80 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 flex flex-col justify-between gap-3 transition">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Step 1 • Connect
                      </span>
                      <Users className="h-4 w-4 text-indigo-400" />
                    </div>
                    <h4 className="text-base font-bold text-white pt-1">Add a CoinMarketCap Account</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Sign in with your email and password or import saved login cookies so the bot can post comments for you.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      handleResetLoginState();
                      setLoginTab("credentials");
                      setShowSessionModal(true);
                    }}
                    className="w-full py-2.5 px-3 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Users className="h-4 w-4" /> Add Account
                  </button>
                </div>

                {/* Step B */}
                <div className="bg-slate-950/80 border border-slate-800 hover:border-blue-500/40 rounded-xl p-4 flex flex-col justify-between gap-3 transition">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        Step 2 • Prepare Queue
                      </span>
                      <Search className="h-4 w-4 text-blue-400" />
                    </div>
                    <h4 className="text-base font-bold text-white pt-1">Fetch Coins & Write AI Comments</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      On the Dashboard, click <strong>Get trending coins</strong> and then <strong>Write comments</strong> (or click <strong>1-Click: Fetch, Write &amp; Post All</strong>).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigateTo("dashboard");
                      setTimeout(() => {
                        document.getElementById("controls-panel")?.scrollIntoView({ behavior: "smooth" });
                      }, 120);
                    }}
                    className="w-full py-2.5 px-3 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="h-4 w-4" /> Go to Control Center
                  </button>
                </div>

                {/* Step C */}
                <div className="bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 rounded-xl p-4 flex flex-col justify-between gap-3 transition">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Step 3 • Automate 24/7
                      </span>
                      <Clock className="h-4 w-4 text-emerald-400" />
                    </div>
                    <h4 className="text-base font-bold text-white pt-1">Start Posting or Enable Scheduler</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Post immediately with <strong>Start Posting</strong>, or use the <strong>24/7 Scheduler</strong> to rotate through multiple accounts automatically.
                    </p>
                  </div>
                  <button
                    onClick={() => navigateTo("scheduler")}
                    className="w-full py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="h-4 w-4" /> Open 24/7 Scheduler
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* TOPIC FILTER STEPPER BAR */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-2.5 rounded-2xl shadow-md">
            {[
              { id: "all", label: "All 5 Guide Topics" },
              { id: "getting-started", label: "1. Getting started" },
              { id: "accounts", label: "2. Adding an account" },
              { id: "scheduler", label: "3. Running the scheduler" },
              { id: "images", label: "4. Images" },
              { id: "troubleshooting", label: "5. If something goes wrong" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setGuideStep(item.id as any)}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                  guideStep === item.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 5-SECTION OPERATIONAL GUIDE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Getting started */}
            {(guideStep === "all" || guideStep === "getting-started") && (
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-blue-400 font-bold block">
                        Section 1 • Readiness Checklist
                      </span>
                      <h2 className="text-base font-bold text-white">Getting started</h2>
                      <p className="text-sm text-slate-400">Quick checklist before your first campaign</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigateTo("health")}
                    className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-blue-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Activity className="h-4 w-4" /> Check Health
                  </button>
                </div>
                <ul className="space-y-2.5">
                  {[
                    "Connect at least one CoinMarketCap account before starting a campaign.",
                    "Check the Health page to make sure the AI Comment Writer is enabled.",
                    "Review your daily post limit (up to 300 posts/day per account) to stay safe.",
                    "Confirm that Cloud Storage shows Connected so your accounts and history are saved.",
                    "Look for the green dot on the top Health button to confirm everything is ready."
                  ].map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70">
                      <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-2 border-t border-slate-800/60 text-sm text-slate-400 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <span><strong className="text-slate-200">Beginner Tip:</strong> Check the green dot on the top <strong>Health</strong> button first.</span>
              </div>
            </div>
            )}

            {/* 2. Adding an account */}
            {(guideStep === "all" || guideStep === "accounts") && (
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold block">
                        Section 2 • Connect Accounts
                      </span>
                      <h2 className="text-base font-bold text-white">Adding an account</h2>
                      <p className="text-sm text-slate-400">Add, switch, or manage your CoinMarketCap accounts</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      handleResetLoginState();
                      setLoginTab("credentials");
                      setShowSessionModal(true);
                    }}
                    className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-indigo-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Users className="h-4 w-4" /> Manage Accounts
                  </button>
                </div>
                <ul className="space-y-2.5">
                  {[
                    "Click the Account button in the top bar to open the account window.",
                    "Sign in with your CoinMarketCap email and password for automatic login.",
                    "Or use Import Cookies to paste a saved login backup from your browser.",
                    "Optionally add a proxy IP to each account to keep accounts separate and safe.",
                    "Keep 3 primary accounts active and 2 backup accounts ready for automatic failover."
                  ].map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-2 border-t border-slate-800/60 text-sm text-slate-400 flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-400 shrink-0" />
                <span><strong className="text-slate-200">Beginner Tip:</strong> Each account keeps its own separate login, coin list, and post history.</span>
              </div>
            </div>
            )}

            {/* 3. Running the scheduler (start, pause, stop, resume) */}
            {(guideStep === "all" || guideStep === "scheduler") && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 md:col-span-2 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20 shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold block">
                      Section 3 • Multi-Account Automation
                    </span>
                    <h2 className="text-base font-bold text-white">Running the scheduler (start, pause, stop, resume)</h2>
                    <p className="text-sm text-slate-400">Automatic account rotation, saved progress, and live controls</p>
                  </div>
                </div>
                <button
                  onClick={() => navigateTo("scheduler")}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-cyan-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Clock className="h-4 w-4" /> Open Scheduler
                </button>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  "Start: Click Run cycle now in the Scheduler tab to start posting across your active accounts.",
                  "Pause: Click Pause to finish the current coin and safely wait.",
                  "Resume: Click Resume to continue posting the remaining coins right where you paused.",
                  "Stop: Click Stop to end the current cycle after the current coin finishes.",
                  "Your progress is saved automatically even if you refresh or close the page.",
                  "Settings are locked while a cycle is running; pause or stop first to change settings."
                ].map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
            )}

            {/* 4. Images */}
            {(guideStep === "all" || guideStep === "images") && (
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 shrink-0">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-purple-400 font-bold block">
                        Section 4 • Chart & Graphic Attachments
                      </span>
                      <h2 className="text-base font-bold text-white">Images</h2>
                      <p className="text-sm text-slate-400">Attaching promotional graphics to your comments</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => imageFileInputRef.current?.click()}
                      disabled={isUploadingImages}
                      className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Upload images from your computer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{isUploadingImages ? "Uploading..." : "Upload Images"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("images");
                        navigateTo("dashboard");
                        setTimeout(() => {
                          document.getElementById("storage-explorer")?.scrollIntoView({ behavior: "smooth" });
                        }, 120);
                      }}
                      className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-purple-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>Image Library ({marketingImages.length})</span>
                    </button>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {[
                    "Upload marketing graphics in PNG, JPG, or WEBP format from your computer or a cloud link.",
                    "Turn on Enable Images to attach one graphic automatically to each comment.",
                    "Choose Cycle mode to rotate through images in order, or Random mode for variety.",
                    "Use Auto-Clean in the Image Library to keep only your newest uploaded graphics."
                  ].map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70">
                      <span className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-2 border-t border-slate-800/60 text-sm text-slate-400 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />
                <span><strong className="text-slate-200">Beginner Tip:</strong> You can pause or enable image attachments anytime on the Dashboard or Scheduler.</span>
              </div>
            </div>
            )}

            {/* 5. If something goes wrong */}
            {(guideStep === "all" || guideStep === "troubleshooting") && (
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold block">
                        Section 5 • Help & Recovery
                      </span>
                      <h2 className="text-base font-bold text-white">If something goes wrong</h2>
                      <p className="text-sm text-slate-400">Quick fixes if an account signs out or a post fails</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigateTo("logs")}
                    className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <TerminalIcon className="h-4 w-4" /> View Logs
                  </button>
                </div>
                <ul className="space-y-2.5">
                  {[
                    "Open the Health page to see if any service needs attention.",
                    "If an account signs out, click Check login or reconnect the account in the Account window.",
                    "If AI comments stop generating, check that your OpenAI credit balance is topped up.",
                    "Open the Logs page to see live activity messages and why a post stopped.",
                    "Any failed coin can be retried in one click from the Post Submissions table."
                  ].map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70">
                      <span className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-2 border-t border-slate-800/60 text-sm text-slate-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span><strong className="text-slate-200">Beginner Tip:</strong> Use <strong>Auto Retry</strong> in the Post Submissions tab to retry any failed coin.</span>
              </div>
            </div>
            )}
          </div>

        </main>
  );
};

