import React from "react";
import {
  BookOpen,
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
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";

type GuideTopicId =
  | "getting-started"
  | "accounts"
  | "scheduler"
  | "images"
  | "troubleshooting"
  | "all";

const TOPIC_ORDER: Exclude<GuideTopicId, "all">[] = [
  "getting-started",
  "accounts",
  "scheduler",
  "images",
  "troubleshooting",
];

export function renderGuidePage(
  navigateTo: any,
  handleResetLoginState: any,
  setLoginTab: any,
  setShowSessionModal: any,
  guideStep: any,
  setGuideStep: any,
  imageFileInputRef: any,
  setActiveTab: any,
  marketingImages: any,
  isUploadingImages?: boolean
) {
  const activeTopic: GuideTopicId = guideStep || "getting-started";
  const currentIdx = TOPIC_ORDER.indexOf(activeTopic as Exclude<GuideTopicId, "all">);
  const prevTopic = currentIdx > 0 ? TOPIC_ORDER[currentIdx - 1] : null;
  const nextTopic =
    currentIdx >= 0 && currentIdx < TOPIC_ORDER.length - 1
      ? TOPIC_ORDER[currentIdx + 1]
      : null;

  const topicLabels: Record<Exclude<GuideTopicId, "all">, string> = {
    "getting-started": "1. Getting started",
    accounts: "2. Adding an account",
    scheduler: "3. Running the scheduler",
    images: "4. Images",
    troubleshooting: "5. If something goes wrong",
  };

  const renderWizardNav = (tipIcon: React.ReactNode, tipText: React.ReactNode) => (
    <div className="pt-3.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="text-sm text-slate-400 flex items-center gap-2">
        {tipIcon}
        <span>{tipText}</span>
      </div>
      {activeTopic !== "all" && (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {prevTopic && (
            <button
              type="button"
              onClick={() => setGuideStep(prevTopic)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
          )}
          {nextTopic && (
            <button
              type="button"
              onClick={() => setGuideStep(nextTopic)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>Next: {topicLabels[nextTopic]}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main
      key="view-guide"
      className="flex-1 p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200"
    >
      {/* Unified Header + Compact 3-Step Quick-Launch Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white">Beginner & Operating Guide</h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold uppercase">
                  Interactive Playbook
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Follow the 3 quick actions below or step through the 5 operating topics
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setGuideStep(activeTopic === "all" ? "getting-started" : "all")
            }
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto shrink-0 ${
              activeTopic === "all"
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
            }`}
            title="Toggle between focused single-topic view and all 5 sections"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{activeTopic === "all" ? "Focused Step View" : "Show All 5 Topics"}</span>
          </button>
        </div>

        {/* Compact 3-Step Quick-Action Pipeline (1 -> 2 -> 3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80">
          {/* Step 1 */}
          <div className="bg-slate-950/80 border border-slate-800/90 hover:border-indigo-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3 transition">
            <div className="min-w-0">
              <span className="text-xs font-mono font-bold uppercase text-indigo-400 block">
                Step 1 • Connect
              </span>
              <div className="text-sm sm:text-base font-bold text-white truncate">
                Add CoinMarketCap Account
              </div>
              <div className="text-xs sm:text-sm text-slate-300 truncate">
                Sign in with email/password or cookies
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                handleResetLoginState();
                setLoginTab("credentials");
                setShowSessionModal(true);
              }}
              className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-bold transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Add Account</span>
            </button>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-950/80 border border-slate-800/90 hover:border-blue-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3 transition">
            <div className="min-w-0">
              <span className="text-xs font-mono font-bold uppercase text-blue-400 block">
                Step 2 • Prepare Queue
              </span>
              <div className="text-sm sm:text-base font-bold text-white truncate">
                Fetch Coins & Write AI
              </div>
              <div className="text-xs sm:text-sm text-slate-300 truncate">
                Scrape trending coins & generate comments
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigateTo("dashboard");
                setTimeout(() => {
                  document
                    .getElementById("controls-panel")
                    ?.scrollIntoView({ behavior: "smooth" });
                }, 120);
              }}
              className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 rounded-xl text-xs sm:text-sm font-bold transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Control Center</span>
            </button>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-950/80 border border-slate-800/90 hover:border-emerald-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3 transition">
            <div className="min-w-0">
              <span className="text-xs font-mono font-bold uppercase text-emerald-400 block">
                Step 3 • Automate 24/7
              </span>
              <div className="text-sm sm:text-base font-bold text-white truncate">
                Post or Rotate Accounts
              </div>
              <div className="text-xs sm:text-sm text-slate-300 truncate">
                Run manual batch or 24/7 multi-account cycle
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateTo("scheduler")}
              className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 rounded-xl text-xs sm:text-sm font-bold transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>24/7 Scheduler</span>
            </button>
          </div>
        </div>

        {/* 5 Interactive Topic Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-slate-800/80">
          {[
            { id: "getting-started", label: "1. Getting started", badge: "5 checks", icon: Zap, color: "text-blue-400" },
            { id: "accounts", label: "2. Adding an account", badge: "5 steps", icon: Users, color: "text-indigo-400" },
            { id: "scheduler", label: "3. Running scheduler", badge: "6 controls", icon: Clock, color: "text-cyan-400" },
            { id: "images", label: "4. Images", badge: "4 steps", icon: ImageIcon, color: "text-purple-400" },
            { id: "troubleshooting", label: "5. Troubleshooting", badge: "5 fixes", icon: AlertTriangle, color: "text-amber-400" },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTopic === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setGuideStep(item.id as any)}
                className={`px-3 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                  isActive
                    ? "bg-indigo-500/15 border-indigo-500/50 text-white shadow-sm"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                  <span className="text-xs sm:text-sm font-bold truncate">{item.label}</span>
                </div>
                <span className="hidden xl:inline-block px-1.5 py-0.5 rounded bg-slate-900 text-xs font-mono text-slate-400 shrink-0">
                  {item.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TOPIC CONTENT AREA (Focused 1-Card View by Default, or All 5 When Toggled) */}
      <div className="space-y-4">
        {/* 1. Getting started */}
        {(activeTopic === "all" || activeTopic === "getting-started") && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">1. Getting started</h2>
                  <p className="text-sm text-slate-400">
                    Quick readiness checklist before launching your first campaign
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("health")}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-blue-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Activity className="h-4 w-4" />
                <span>Check Health</span>
              </button>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                "Connect at least one CoinMarketCap account before starting a campaign.",
                "Check the Health page to make sure the AI Comment Writer is enabled.",
                "Review your daily post limit (up to 300 posts/day per account) to stay safe.",
                "Confirm that Cloud Storage shows Connected so your accounts and history are saved.",
                "Look for the green dot on the top Health button to confirm everything is ready.",
              ].map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {renderWizardNav(
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />,
              <>
                <strong className="text-slate-200">Beginner Tip:</strong> Check the green dot on the top{" "}
                <strong>Health</strong> button first.
              </>
            )}
          </div>
        )}

        {/* 2. Adding an account */}
        {(activeTopic === "all" || activeTopic === "accounts") && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">2. Adding an account</h2>
                  <p className="text-sm text-slate-400">
                    Add, switch, or isolate your CoinMarketCap accounts with proxies
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleResetLoginState();
                  setLoginTab("credentials");
                  setShowSessionModal(true);
                }}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-indigo-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Users className="h-4 w-4" />
                <span>Manage Accounts</span>
              </button>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                "Click the Account button in the top bar to open the account window.",
                "Sign in with your CoinMarketCap email and password for automatic login.",
                "Or use Import Cookies to paste a saved login backup from your browser.",
                "Optionally add a proxy IP to each account to keep accounts separate and safe.",
                "Keep 3 primary accounts active and 2 backup accounts ready for automatic failover.",
              ].map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70"
                >
                  <span className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {renderWizardNav(
              <Shield className="h-4 w-4 text-indigo-400 shrink-0" />,
              <>
                <strong className="text-slate-200">Beginner Tip:</strong> Each account keeps its own separate login, coin list, and post history.
              </>
            )}
          </div>
        )}

        {/* 3. Running the scheduler (start, pause, stop, resume) */}
        {(activeTopic === "all" || activeTopic === "scheduler") && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20 shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    3. Running the scheduler (start, pause, stop, resume)
                  </h2>
                  <p className="text-sm text-slate-400">
                    Automatic account rotation, saved progress, and live controls
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("scheduler")}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-cyan-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Clock className="h-4 w-4" />
                <span>Open Scheduler</span>
              </button>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                "Start: Click Run cycle now in the Scheduler tab to start posting across your active accounts.",
                "Pause: Click Pause to finish the current coin and safely wait.",
                "Resume: Click Resume to continue posting the remaining coins right where you paused.",
                "Stop: Click Stop to end the current cycle after the current coin finishes.",
                "Your progress is saved automatically even if you refresh or close the page.",
                "Settings are locked while a cycle is running; pause or stop first to change settings.",
              ].map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70"
                >
                  <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {renderWizardNav(
              <Clock className="h-4 w-4 text-cyan-400 shrink-0" />,
              <>
                <strong className="text-slate-200">Beginner Tip:</strong> Toggle any account between{" "}
                <strong>Active in Cycle</strong> and <strong>Standby / Backup</strong> in 1 click.
              </>
            )}
          </div>
        )}

        {/* 4. Images */}
        {(activeTopic === "all" || activeTopic === "images") && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 shrink-0">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">4. Images</h2>
                  <p className="text-sm text-slate-400">
                    Attaching promotional graphics and charts to your comments
                  </p>
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
                      document
                        .getElementById("storage-explorer")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }, 120);
                  }}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-purple-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Image Library ({marketingImages.length})</span>
                </button>
              </div>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                "Upload marketing graphics in PNG, JPG, or WEBP format from your computer or a cloud link.",
                "Turn on Enable Images to attach one graphic automatically to each comment.",
                "Choose Cycle mode to rotate through images in order, or Random mode for variety.",
                "Use Auto-Clean in the Image Library to keep only your newest uploaded graphics.",
              ].map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70"
                >
                  <span className="w-5 h-5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {renderWizardNav(
              <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />,
              <>
                <strong className="text-slate-200">Beginner Tip:</strong> You can pause or enable image attachments anytime on the Dashboard or Scheduler.
              </>
            )}
          </div>
        )}

        {/* 5. If something goes wrong */}
        {(activeTopic === "all" || activeTopic === "troubleshooting") && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">5. If something goes wrong</h2>
                  <p className="text-sm text-slate-400">
                    Quick fixes if an account signs out or a post fails
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("logs")}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <TerminalIcon className="h-4 w-4" />
                <span>View Logs</span>
              </button>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                "Open the Health page to see if any service needs attention.",
                "If an account signs out, click Check login or reconnect the account in the Account window.",
                "If AI comments stop generating, check that your OpenAI credit balance is topped up.",
                "Open the Logs page to see live activity messages and why a post stopped.",
                "Any failed coin can be retried in one click from the Post Submissions table.",
              ].map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 text-sm text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800/70"
                >
                  <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {renderWizardNav(
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />,
              <>
                <strong className="text-slate-200">Beginner Tip:</strong> Use <strong>Auto Retry</strong> in the Post Submissions tab to retry any failed coin.
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
