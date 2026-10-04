import React, { useState, useEffect, useRef } from "react";
import {
  Activity,
  Terminal as TerminalIcon,
  Play,
  Pause,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Database,
  FileText,
  Download,
  Trash2,
  Lock,
  Key,
  Layers,
  HelpCircle,
  ChevronRight,
  Globe,
  Upload,
  BookOpen,
  ArrowDown,
  Users,
  Camera,
  Eye,
  Shield,
  ArrowLeft,
  HardDrive,
  Bell,
  BellOff,
  X,
  Info,
  Clock,
  ExternalLink
} from "lucide-react";

// Types matching backend server structures
interface Coin {
  name: string;
  symbol: string;
  price: number;
  change_1h?: number;
  change_24h: number;
  change_7d?: number;
  market_cap: number;
  volume_24h: number;
  cmc_rank?: number;
  slug: string;
  url: string;
}

interface GeneratedMessage {
  name: string;
  symbol: string;
  url: string;
  message: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

interface PostResult {
  name: string;
  symbol: string;
  url: string;
  status: "success" | "captcha" | "expired" | "failed" | "retry" | "skipped";
  message: string;
  timestamp: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

interface Profile {
  id: string;
  name: string;
  stateJson: string;
  isActive: boolean;
  loginStatus?: string;
  updatedAt: string;
}

const resolveUrl = (url: string): string => {
  const base = (import.meta as any).env?.BASE_URL || "/";
  if (url.startsWith("/")) {
    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${normalizedBase}${url}`;
  }
  return url;
};

const parseResponseJson = async (res: Response, defaultVal: any = {}): Promise<any> => {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "");
      return { error: text.slice(0, 500) || `HTTP error ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    console.warn("[JSON PARSE] Failed to parse JSON:", err);
    return defaultVal;
  }
};

// High-performance O(1) comparison helpers to eliminate UI freezing and main-thread lag
function areLogsEqual(prev: LogEntry[], next: LogEntry[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  const pLast = prev[prev.length - 1];
  const nLast = next[next.length - 1];
  return pLast?.timestamp === nLast?.timestamp && pLast?.message === nLast?.message && pLast?.level === nLast?.level;
}

function areCoinsEqual(prev: Coin[], next: Coin[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  return prev[0]?.symbol === next[0]?.symbol && prev[prev.length - 1]?.symbol === next[next.length - 1]?.symbol;
}

function areMessagesEqual(prev: GeneratedMessage[], next: GeneratedMessage[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  return prev[0]?.symbol === next[0]?.symbol && prev[prev.length - 1]?.symbol === next[next.length - 1]?.symbol;
}

function areResultsEqual(prev: PostResult[], next: PostResult[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  const pLast = prev[prev.length - 1];
  const nLast = next[next.length - 1];
  return pLast?.symbol === nLast?.symbol && pLast?.status === nLast?.status && pLast?.timestamp === nLast?.timestamp;
}

function areProfilesEqual(prev: any[], next: any[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i]?.id !== next[i]?.id || prev[i]?.isActive !== next[i]?.isActive || prev[i]?.loginStatus !== next[i]?.loginStatus || prev[i]?.name !== next[i]?.name) {
      return false;
    }
  }
  return true;
}

// User-friendly time age helper to see how fresh or stale fetched coins and generated comments are
function formatTimeAgo(timestamp: number | null | undefined): { text: string; full: string; isStale: boolean; isVeryStale: boolean; hasTimestamp: boolean } {
  if (!timestamp) {
    return { text: "Previous session", full: "Exact time not recorded in this session", isStale: true, isVeryStale: false, hasTimestamp: false };
  }
  const time = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(time) || time <= 0) {
    return { text: "Previous session", full: "N/A", isStale: true, isVeryStale: false, hasTimestamp: false };
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  const full = new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (diffSec < 60) {
    return { text: "Just now (<1m ago)", full, isStale: false, isVeryStale: false, hasTimestamp: true };
  }
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) {
    return { text: `${mins}m ago`, full, isStale: mins >= 30, isVeryStale: mins >= 60, hasTimestamp: true };
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return { text: `${hours}h ${remMins}m ago`, full, isStale: true, isVeryStale: hours >= 3, hasTimestamp: true };
  }
  const days = Math.floor(hours / 24);
  return { text: `${days}d ago`, full, isStale: true, isVeryStale: true, hasTimestamp: true };
}

// Dedicated isolated countdown component to prevent re-rendering the entire 3,400-line App every second
const CycleCountdown = React.memo(function CycleCountdown({ nextCycleStartTime }: { nextCycleStartTime: number | null }) {
  const [diff, setDiff] = useState<number | null>(() => {
    if (!nextCycleStartTime) return null;
    return Math.max(0, Math.floor((nextCycleStartTime - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!nextCycleStartTime) {
      setDiff(null);
      return;
    }
    const update = () => {
      const now = Date.now();
      const val = Math.max(0, Math.floor((nextCycleStartTime - now) / 1000));
      setDiff(val);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [nextCycleStartTime]);

  if (!nextCycleStartTime || diff === null || diff <= 0) return null;

  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return (
    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span className="text-[11px] text-emerald-400 font-bold">Cooldown Active</span>
      </div>
      <span className="font-mono text-xs text-slate-300">
        Next cycle in: <strong className="text-emerald-400 font-bold">{mins}m {secs}s</strong>
      </span>
    </div>
  );
});

export default function App() {
  // Application State
  const [status, setStatus] = useState<string>("Idle");
  const [runMode, setRunMode] = useState<string>("Real Browser");
  const [totalCoins, setTotalCoins] = useState<number>(0);
  const [generatedCount, setGeneratedCount] = useState<number>(0);
  const [postedCount, setPostedCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [results, setResults] = useState<PostResult[]>([]);
  const [progressIndex, setProgressIndex] = useState<number>(0);
  const [currentCoin, setCurrentCoin] = useState<string>("N/A");
  const [coinsFetchedAt, setCoinsFetchedAt] = useState<number | null>(null);
  const [commentsGeneratedAt, setCommentsGeneratedAt] = useState<number | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>("Not Checked");
  const [apiStatus, setApiStatus] = useState<{
    openai: boolean;
    gemini: boolean;
    cmc: boolean;
    openaiError?: string | null;
    geminiError?: string | null;
  }>({ openai: false, gemini: false, cmc: false, openaiError: null, geminiError: null });
  const [isContinuousLoopActive, setIsContinuousLoopActive] = useState<boolean>(false);
  const [nextCycleStartTime, setNextCycleStartTime] = useState<number | null>(null);
  const [continuousInterval, setContinuousInterval] = useState<number>(20);
  const isInitialIntervalLoaded = useRef<boolean>(false);

  // Smooth Action & Switching States
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
  const [isStartingPost, setIsStartingPost] = useState<boolean>(false);
  const [isStoppingPost, setIsStoppingPost] = useState<boolean>(false);

  // Browser Session Upload State
  const [sessionJson, setSessionJson] = useState<string>("");
  const [sessionExists, setSessionExists] = useState<boolean>(false);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [activeSessionContent, setActiveSessionContent] = useState<string>("");
  const [showConfirmFetchModal, setShowConfirmFetchModal] = useState<boolean>(false);
  const [showConfirmGenerateModal, setShowConfirmGenerateModal] = useState<boolean>(false);

  // Account Profiles support
  const [profilesList, setProfilesList] = useState<any[]>([]);
  const [newProfileName, setNewProfileName] = useState<string>("");
  const [newProfileJson, setNewProfileJson] = useState<string>("");
  const [activeProfile, setActiveProfile] = useState<any | null>(null);
  const [showProfileAddForm, setShowProfileAddForm] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Routing state between Main Dashboard and Admin Screen
  const [currentView, setCurrentView] = useState<"dashboard" | "admin">(() => {
    if (typeof window !== "undefined") {
      if (window.location.pathname.startsWith("/admin") || window.location.hash.startsWith("#/admin")) {
        return "admin";
      }
    }
    return "dashboard";
  });

  useEffect(() => {
    const handleNav = () => {
      if (window.location.pathname.startsWith("/admin") || window.location.hash.startsWith("#/admin")) {
        setCurrentView("admin");
      } else {
        setCurrentView("dashboard");
      }
    };
    window.addEventListener("popstate", handleNav);
    window.addEventListener("hashchange", handleNav);
    return () => {
      window.removeEventListener("popstate", handleNav);
      window.removeEventListener("hashchange", handleNav);
    };
  }, []);

  const navigateTo = (view: "dashboard" | "admin") => {
    setCurrentView(view);
    const path = view === "admin" ? "/admin" : "/";
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  };

  // Transient Toast Notification State (No history stored, auto-dismisses in seconds)
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cmc_notifications_enabled");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "process";
    isProcess?: boolean;
  } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (message: string, type: "success" | "error" | "info" | "process" = "info", durationMs: number = 4000) => {
    // If notifications are turned off, suppress unless it's a critical error
    if (!notificationsEnabled && type !== "error") {
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast({ message, type, isProcess: type === "process" });
    // Process toasts stay visible until the process completes or changes
    if (type !== "process") {
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
      }, durationMs);
    }
  };

  const dismissToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  };

  const toggleNotifications = () => {
    setNotificationsEnabled(prev => {
      const nextVal = !prev;
      localStorage.setItem("cmc_notifications_enabled", String(nextVal));
      if (!nextVal) {
        dismissToast();
      } else {
        setToast({ message: "Notifications turned ON", type: "info", isProcess: false });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 2500);
      }
      return nextVal;
    });
  };

  // Interactive Login State
  const [loginTab, setLoginTab] = useState<"credentials" | "cookies" | "profiles">("credentials");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loginStep, setLoginStep] = useState<"idle" | "authenticating" | "otp_required" | "success" | "failed">("idle");
  const [otpCode, setOtpCode] = useState<string>("");
  const [loginStatusMessage, setLoginStatusMessage] = useState<string>("");
  const [confirmSwitchProfile, setConfirmSwitchProfile] = useState<Profile | null>(null);

  // Logs state
  const [logsList, setLogsList] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");

  // Data Explorer Tabs & Search Filters
  const [activeTab, setActiveTab] = useState<string>("coins");
  const [coinsList, setCoinsList] = useState<Coin[]>([]);
  const [messagesList, setMessagesList] = useState<GeneratedMessage[]>([]);
  const [coinSearchQuery, setCoinSearchQuery] = useState<string>("");
  const [commentSearchQuery, setCommentSearchQuery] = useState<string>("");

  // System Check State
  const [systemCheckResult, setSystemCheckResult] = useState<{
    playwrightInstalled: boolean;
    browsersPath: string;
    executablePath: string;
    executableExists: boolean;
    launchStatus: "success" | "failed";
    message: string;
    missingLibraries: string[];
  } | null>(null);
  const [isCheckingSystem, setIsCheckingSystem] = useState<boolean>(false);

  // Action Pending loaders
  const [isPending, setIsPending] = useState({
    login: false,
    fetch: false,
    generate: false,
    post: false,
    full: false,
    clear: false,
  });

  const [isRefreshingData, setIsRefreshingData] = useState<boolean>(false);

  const handleManualRefresh = async () => {
    setIsRefreshingData(true);
    try {
      await fetchStats();
      await fetchProfiles();
      await fetchSessionDetails();
      
      const coinsRes = await fetch(resolveUrl(`/output/last_trending.json?t=${Date.now()}`));
      const coinsData = coinsRes.ok ? await coinsRes.json() : [];
      setCoinsList(Array.isArray(coinsData) ? coinsData : []);

      const msgsRes = await fetch(resolveUrl(`/output/generated_messages.json?t=${Date.now()}`));
      const msgsData = msgsRes.ok ? await msgsRes.json() : [];
      setMessagesList(Array.isArray(msgsData) ? msgsData : []);

      showToast("Data storage refreshed successfully!", "success");
    } catch (err) {
      showToast("Failed to refresh data: " + (err as Error).message, "error");
    } finally {
      setIsRefreshingData(false);
    }
  };

  const isPostingActive =
    status === "Posting" ||
    status === "Stopping" ||
    isStartingPost ||
    isStoppingPost ||
    isPending.post ||
    isContinuousLoopActive;

  const isBusy =
    status === "Fetching" ||
    status === "Generating" ||
    status === "Posting" ||
    status === "Stopping" ||
    status === "Authenticating" ||
    status === "Verifying Code" ||
    status === "Checking Login" ||
    isStartingPost ||
    isStoppingPost ||
    isContinuousLoopActive ||
    isPending.fetch ||
    isPending.generate ||
    isPending.post ||
    isPending.full ||
    isPending.login ||
    isPending.clear;

  // Browser Simulator Visual Typing State
  const [simText, setSimText] = useState("");
  const [simTargetCoin, setSimTargetCoin] = useState<string>("");
  const [simActive, setSimActive] = useState(false);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  // Auto scroll logs console
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const lastLogsLength = useRef(0);
  const lastRequestTimestamp = useRef<number>(0);

  // Fetch initial stats and list on page load
  useEffect(() => {
    fetchStats();
    fetchLogs();
    fetchSessionDetails();
    fetchProfiles();
    checkSystemHealth();
    
    // Initial fetch of lists
    fetchCoins();
    fetchMessages();

    // Setup periodic polling for status & logs with tiered intervals to optimize CPU & network bandwidth
    let pollTick = 0;
    const interval = setInterval(() => {
      pollTick++;
      // High frequency (every 3s): core runtime status and live terminal logs
      fetchStats();
      fetchLogs();

      // Lower frequency (every 9s): accounts list & session details
      if (pollTick % 3 === 0) {
        fetchProfiles();
        fetchSessionDetails();
      }

      // Medium frequency (every 6s): output files
      if (pollTick % 2 === 0) {
        fetchCoins();
        fetchMessages();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Sync Simulator with current posting state
  useEffect(() => {
    if (status === "Posting" && currentCoin !== "N/A" && currentCoin !== simTargetCoin) {
      setSimTargetCoin(currentCoin);
      // Retrieve message for this coin to trigger simulator typing
      const matched = messagesList.find(m => `${m.name} (${m.symbol})` === currentCoin);
      if (matched) {
        startSimulatorTyping(matched.message);
      }
    } else if (status !== "Posting") {
      setSimActive(false);
      setSimText("");
    }
  }, [status, currentCoin, messagesList]);

  // Handle typing animation inside Browser Simulator
  const startSimulatorTyping = (fullMessage: string) => {
    if (typingTimer.current) clearInterval(typingTimer.current);
    setSimActive(true);
    setSimText("");
    let index = 0;
    typingTimer.current = setInterval(() => {
      if (index < fullMessage.length) {
        setSimText(prev => prev + fullMessage.charAt(index));
        index++;
      } else {
        if (typingTimer.current) clearInterval(typingTimer.current);
      }
    }, 45); // Typing speed
  };

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearInterval(typingTimer.current);
    };
  }, []);

  // Fast fetch coins with O(1) equality check
  const fetchCoins = async () => {
    try {
      const res = await fetch(resolveUrl(`/output/last_trending.json?t=${Date.now()}`));
      const data = res.ok ? await res.json() : [];
      const arr = Array.isArray(data) ? data : [];
      setCoinsList(prev => areCoinsEqual(prev, arr) ? prev : arr);
    } catch (_) {}
  };

  // Fast fetch messages with O(1) equality check
  const fetchMessages = async () => {
    try {
      const res = await fetch(resolveUrl(`/output/generated_messages.json?t=${Date.now()}`));
      const data = res.ok ? await res.json() : [];
      const arr = Array.isArray(data) ? data : [];
      setMessagesList(prev => areMessagesEqual(prev, arr) ? prev : arr);
    } catch (_) {}
  };

  // Fetch Current logs with O(1) equality check
  const fetchLogs = async () => {
    try {
      const res = await fetch(resolveUrl("/api/logs"));
      if (res.ok) {
        const data = await parseResponseJson(res, { logs: [] });
        const list = (data.logs || []).slice(-100);
        setLogsList(prev => areLogsEqual(prev, list) ? prev : list);
      }
    } catch (_) {}
  };

  // Fetch Session details
  const fetchSessionDetails = async () => {
    try {
      const res = await fetch(resolveUrl("/api/get-session"));
      if (res.ok) {
        const data = await parseResponseJson(res, { exists: false });
        setSessionExists(data.exists);
        setSessionDetails(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data.details)) return prev;
          return data.details;
        });
        setActiveSessionContent(prev => prev === (data.content || "") ? prev : (data.content || ""));
      }
    } catch (_) {}
  };

  // Fetch account profiles with O(1) comparison
  const fetchProfiles = async () => {
    try {
      const res = await fetch(resolveUrl("/api/profiles"));
      if (res.ok) {
        const data = await parseResponseJson(res, { profiles: [] });
        const list = data.profiles || [];
        setProfilesList(prev => areProfilesEqual(prev, list) ? prev : list);
        const active = list.find((p: any) => p.isActive);
        setActiveProfile(prev => {
          if (prev && active && prev.id === active.id && prev.name === active.name && prev.stateJson === active.stateJson && prev.isActive === active.isActive && prev.loginStatus === active.loginStatus) {
            return prev;
          }
          return active || null;
        });
      }
    } catch (e) {
      console.warn("Could not fetch profiles (transient network check):", (e as Error).message);
    }
  };

  const handleSaveProfile = async (name: string, stateJson: string) => {
    if (!name.trim() || !stateJson.trim()) {
      showToast("Please provide both profile name and cookies JSON.", "error");
      return;
    }
    try {
      const res = await fetch(resolveUrl("/api/save-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stateJson })
      });
      if (res.ok) {
        setNewProfileName("");
        setNewProfileJson("");
        setShowProfileAddForm(false);
        fetchProfiles();
        fetchSessionDetails();
        showToast(`Account profile for "${name}" saved successfully!`, "success");
      } else {
        const data = await parseResponseJson(res, { error: "Failed to save profile." });
        showToast(data.error || "Failed to save profile.", "error");
      }
    } catch (error) {
      showToast("Error saving profile: " + (error as Error).message, "error");
    }
  };

  // Prompt user for explicit confirmation before switching active accounts
  const promptSwitchProfile = (profile: Profile) => {
    if (profile.id === activeProfile?.id) {
      showToast(`"${profile.name}" is already the active account profile.`, "info");
      return;
    }
    if (isBusy || isPostingActive || isContinuousLoopActive) {
      showToast("Cannot switch accounts while posting or background process is active. Please click 'Stop Posting' first.", "error");
      return;
    }
    setConfirmSwitchProfile(profile);
  };

  // Buttery-smooth account switching with instant UI response
  const handleActivateProfile = async (id: string) => {
    if (isBusy || isPostingActive || isContinuousLoopActive) {
      showToast("Cannot switch accounts while posting or background process is active. Please click 'Stop Posting' first.", "error");
      return;
    }
    setSwitchingProfileId(id);
    
    // Instant optimistic update in UI
    setProfilesList(prev => prev.map(p => ({ ...p, isActive: p.id === id })));
    const target = profilesList.find(p => p.id === id);
    if (target) {
      setActiveProfile({ ...target, isActive: true });
    }

    showToast("Switching active account profile...", "process");

    try {
      const res = await fetch(resolveUrl("/api/activate-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        await Promise.all([
          fetchProfiles(),
          fetchSessionDetails(),
          fetchStats(),
          fetchCoins(),
          fetchMessages(),
          fetchLogs()
        ]);
        showToast("Account switched successfully!", "success");
      } else {
        const data = await parseResponseJson(res, { error: "Failed to switch account." });
        showToast(data.error || "Failed to switch account.", "error");
        fetchProfiles();
      }
    } catch (error) {
      showToast("Error switching account: " + (error as Error).message, "error");
      fetchProfiles();
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (isBusy || isContinuousLoopActive) {
      showToast("Cannot delete profile while a background automation run is in progress.", "error");
      return;
    }
    try {
      const res = await fetch(resolveUrl("/api/delete-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchProfiles();
        fetchSessionDetails();
        showToast("Account profile deleted successfully.", "success");
      } else {
        const data = await parseResponseJson(res, { error: "Failed to delete profile." });
        showToast(data.error || "Failed to delete profile.", "error");
      }
    } catch (error) {
      showToast("Error deleting profile: " + (error as Error).message, "error");
    }
  };

  // Fetch Status Stats
  const fetchStats = async () => {
    const reqTime = Date.now();
    try {
      const res = await fetch(resolveUrl("/api/status"));
      if (res.ok) {
        if (reqTime < lastRequestTimestamp.current) {
          return; // Skip stale out-of-order poll response
        }
        lastRequestTimestamp.current = reqTime;
        const data = await parseResponseJson(res, {});
        setStatus(data.status || "Idle");
        setRunMode(data.runMode || "Real Browser");
        setTotalCoins(data.totalCoins || 0);
        setGeneratedCount(data.generatedMessages || 0);
        setPostedCount(data.postedCount || 0);
        setFailedCount(data.failedCount || 0);
        const resList = data.results || [];
        setResults(prev => areResultsEqual(prev, resList) ? prev : resList);
        setProgressIndex(data.progressIndex || 0);
        setCurrentCoin(data.currentCoin || "N/A");
        if (data.coinsFetchedAt !== undefined) {
          setCoinsFetchedAt(data.coinsFetchedAt);
        }
        if (data.commentsGeneratedAt !== undefined) {
          setCommentsGeneratedAt(data.commentsGeneratedAt);
        }
        setSessionStatus(data.sessionStatus || "Not Checked");
        const apiStat = data.apiStatus || { openai: false, cmc: false };
        setApiStatus(prev => {
          if (JSON.stringify(prev) === JSON.stringify(apiStat)) return prev;
          return apiStat;
        });
        setIsContinuousLoopActive(!!data.isContinuousLoopActive);
        setNextCycleStartTime(data.nextCycleStartTime);
        if (data.continuousLoopIntervalMinutes !== undefined && !isInitialIntervalLoaded.current) {
          setContinuousInterval(data.continuousLoopIntervalMinutes);
          isInitialIntervalLoaded.current = true;
        }

        // Synchronize stopping & starting status
        if (data.status === "Stopping" || data.isStopping) {
          setIsStoppingPost(true);
        } else if (data.status === "Idle" && !data.isStopping) {
          setIsStoppingPost(false);
          setIsStartingPost(false);
        }
        if (data.status === "Posting") {
          setIsStartingPost(false);
        }

        if (data.sessionStatus === "Session active") {
          // If session became active, transition or maintain success!
          setLoginStep(prev => {
            if (prev === "authenticating" || prev === "failed") return "success";
            return prev;
          });
        }
        if (data.loginState) {
          const step = data.loginState.status === "requires_otp" ? "otp_required" : data.loginState.status;
          setLoginStep(prev => {
            if (prev === "idle" && step === "success") return "idle";
            // If session is already active, ignore false failures!
            if (data.sessionStatus === "Session active" && step === "failed") return "success";
            if (step === "success") return "success";
            return step;
          });
          if (step !== "idle") {
            if (data.sessionStatus === "Session active" && step === "failed") {
              setLoginStatusMessage("Session is active and verified! Account logged in successfully.");
            } else {
              setLoginStatusMessage(data.loginState.message);
            }
          }
        }
      }
    } catch (_) {}
  };

  const toggleContinuousLoop = async (active: boolean, intervalMins?: number) => {
    const targetMins = intervalMins !== undefined ? intervalMins : continuousInterval;
    showToast(
      active ? `Continuous automation activated (${targetMins}m gap)` : "Continuous automation halted",
      active ? "success" : "info",
      3000
    );
    try {
      const res = await fetch(resolveUrl("/api/set-continuous-loop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, intervalMinutes: targetMins }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsContinuousLoopActive(!!data.isContinuousLoopActive);
        setNextCycleStartTime(data.nextCycleStartTime);
        if (data.continuousLoopIntervalMinutes !== undefined) {
          setContinuousInterval(data.continuousLoopIntervalMinutes);
        }
      }
    } catch (_) {}
  };

  const saveIntervalToServer = async (mins: number) => {
    showToast(`Cooldown interval set to ${mins} minutes`, "info", 2000);
    try {
      const res = await fetch(resolveUrl("/api/set-continuous-loop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes: mins }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.continuousLoopIntervalMinutes !== undefined) {
          setContinuousInterval(data.continuousLoopIntervalMinutes);
        }
        setNextCycleStartTime(data.nextCycleStartTime);
      }
    } catch (_) {}
  };

  // Run System & Playwright Environment Diagnostic Check
  const checkSystemHealth = async () => {
    setIsCheckingSystem(true);
    try {
      const res = await fetch(resolveUrl("/api/check-system"));
      if (res.ok) {
        const data = await res.json();
        setSystemCheckResult(data);
      } else {
        setSystemCheckResult({
          playwrightInstalled: false,
          browsersPath: "Error",
          executablePath: "Error",
          executableExists: false,
          launchStatus: "failed",
          message: "Failed to connect to system check endpoint.",
          missingLibraries: [],
        });
      }
    } catch (err) {
      setSystemCheckResult({
        playwrightInstalled: false,
        browsersPath: "Error",
        executablePath: "Error",
        executableExists: false,
        launchStatus: "failed",
        message: (err as Error).message || "Connection failed.",
        missingLibraries: [],
      });
    } finally {
      setIsCheckingSystem(false);
    }
  };

  // Lazy Load Data lists based on Active Tab
  useEffect(() => {
    if (activeTab === "coins") {
      fetch(resolveUrl(`/output/last_trending.json?t=${Date.now()}`))
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          const arr = Array.isArray(data) ? data : [];
          setCoinsList(prev => areCoinsEqual(prev, arr) ? prev : arr);
        })
        .catch(() => {});
    } else if (activeTab === "comments" || activeTab === "reports") {
      fetch(resolveUrl(`/output/generated_messages.json?t=${Date.now()}`))
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          const arr = Array.isArray(data) ? data : [];
          setMessagesList(prev => areMessagesEqual(prev, arr) ? prev : arr);
        })
        .catch(() => {});
    }
  }, [activeTab, status]);

  // Smart auto-scroll that only scrolls to the bottom if the user is already near the bottom and auto-scroll is enabled
  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container) return;

    if (logsList.length > lastLogsLength.current) {
      if (autoScroll) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        // Check if user is scrolled near the bottom (within a 100px threshold of the newly rendered contents)
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        if (isNearBottom) {
          // Instant direct scroll to bottom - never scrolls the parent browser page or iframe
          container.scrollTop = scrollHeight;
        }
      }
    }
    lastLogsLength.current = logsList.length;
  }, [logsList, autoScroll]);

  // Execute Endpoint Commands with live process indicator & completion notification
  const runCommand = async (endpoint: string, pendingKey: keyof typeof isPending, bodyData?: any) => {
    setIsPending(prev => ({ ...prev, [pendingKey]: true }));
    lastRequestTimestamp.current = Date.now(); // Invalidate any pending polls

    // Live process notification
    let processLabel = "Processing command...";
    if (endpoint.includes("check-login")) processLabel = "Verifying CoinMarketCap session with real browser...";
    else if (endpoint.includes("fetch-trending")) processLabel = "Fetching live trending coins from CoinMarketCap...";
    else if (endpoint.includes("generate-messages")) processLabel = "Generating tailored crypto comments using AI...";
    else if (endpoint.includes("post-chat")) processLabel = "Launching Playwright to submit comments...";
    else if (endpoint.includes("stop-posting")) processLabel = "Stopping posting sequence...";
    else if (endpoint.includes("full-flow")) processLabel = "Starting full automated bot cycle...";
    else if (endpoint.includes("clear-all")) processLabel = "Resetting local storage and clearing data...";
    else if (endpoint.includes("clear-session")) processLabel = "Deleting auth/state.json session file...";

    showToast(processLabel, "process");

    try {
      const options: RequestInit = { method: "POST" };
      if (bodyData !== undefined) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(bodyData);
      }
      const res = await fetch(resolveUrl(endpoint), options);
      const data = await parseResponseJson(res, {});
      if (data && data.error) {
        showToast(data.error, "error", 5000);
      } else {
        // Successful response feedback
        if (endpoint.includes("check-login")) {
          showToast(data.message || (data.status === "Logged In" ? "Session verified active! Browser authenticated." : "Session check completed."), "success", 4000);
        } else if (endpoint.includes("fetch-trending")) {
          showToast(`Fetched ${data.totalCoins || "trending"} coins successfully!`, "success", 4000);
          const fTime = data.coinsFetchedAt || Date.now();
          setCoinsFetchedAt(fTime);
          try {
            localStorage.setItem(`cmc_real_fetch_${activeProfile?.id || "default"}`, String(fTime));
          } catch (_) {}
        } else if (endpoint.includes("generate-messages")) {
          showToast(`Generated ${data.totalGenerated || "new"} comments successfully!`, "success", 4000);
          const gTime = data.commentsGeneratedAt || Date.now();
          setCommentsGeneratedAt(gTime);
          try {
            localStorage.setItem(`cmc_real_gen_${activeProfile?.id || "default"}`, String(gTime));
          } catch (_) {}
        } else if (endpoint.includes("post-chat")) {
          showToast("Posting sequence started successfully.", "success", 4000);
        } else if (endpoint.includes("stop-posting")) {
          showToast("Posting sequence stopped.", "info", 4000);
        } else if (endpoint.includes("full-flow")) {
          showToast("Full bot cycle execution initiated.", "success", 4000);
          const now = Date.now();
          setCoinsFetchedAt(now);
          setCommentsGeneratedAt(now);
          try {
            localStorage.setItem(`cmc_real_fetch_${activeProfile?.id || "default"}`, String(now));
            localStorage.setItem(`cmc_real_gen_${activeProfile?.id || "default"}`, String(now));
          } catch (_) {}
        } else if (endpoint.includes("clear-all")) {
          showToast("Storage and stats reset successfully.", "success", 4000);
        } else if (endpoint.includes("clear-session")) {
          showToast("Session file removed.", "success", 4000);
        }
      }
      // Set timestamp after execution to invalidate poll requests sent during command
      lastRequestTimestamp.current = Date.now();
      if (endpoint.includes("stop-posting")) {
        setIsContinuousLoopActive(false);
        setNextCycleStartTime(null);
        setIsStoppingPost(true);
        setStatus("Stopping");
      }
      if (endpoint.includes("post-chat")) {
        setIsStartingPost(true);
        setStatus("Posting");
      }
      if (endpoint.includes("clear-all")) {
        setCoinsFetchedAt(null);
        setCommentsGeneratedAt(null);
        try {
          localStorage.removeItem(`cmc_real_fetch_${activeProfile?.id || "default"}`);
          localStorage.removeItem(`cmc_real_gen_${activeProfile?.id || "default"}`);
        } catch (_) {}
        setCoinsList([]);
        setMessagesList([]);
        setResults([]);
        setLogsList([]);
        setTotalCoins(0);
        setGeneratedCount(0);
        setPostedCount(0);
        setFailedCount(0);
        setProgressIndex(0);
        setCurrentCoin("N/A");
      }
      if (endpoint.includes("fetch-trending") || endpoint.includes("generate-messages") || endpoint.includes("full-flow") || endpoint.includes("clear-all")) {
        setTimeout(() => {
          fetchCoins();
          fetchMessages();
        }, 800);
      }
      fetchStats();
      fetchLogs();
      if (endpoint.includes("save-session") || endpoint.includes("clear-session")) {
        fetchSessionDetails();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsPending(prev => ({ ...prev, [pendingKey]: false }));
    }
  };

  // Save state.json
  const handleSaveSession = async () => {
    if (!sessionJson.trim()) return;
    setIsPending(prev => ({ ...prev, login: true }));
    try {
      const res = await fetch(resolveUrl("/api/save-session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateJson: sessionJson })
      });
      if (res.ok) {
        setSessionJson("");
        setShowSessionModal(false);
        fetchSessionDetails();
        fetchProfiles();
        fetchStats();
      } else {
        const data = await parseResponseJson(res, { error: "Failed to parse session state JSON." });
        alert(data.error || "Failed to parse session state JSON.");
      }
    } catch (error) {
      alert("Error saving session: " + (error as Error).message);
    } finally {
      setIsPending(prev => ({ ...prev, login: false }));
    }
  };

  // Start credential-based login
  const handleStartLogin = async () => {
    if (!email.trim() || !password.trim()) {
      alert("Please fill in both email and password.");
      return;
    }
    setLoginStep("authenticating");
    setLoginStatusMessage("Initializing secure browser, navigating to CoinMarketCap and entering credentials...");
    try {
      const res = await fetch(resolveUrl("/api/start-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await parseResponseJson(res, { error: "Authentication service not responding." });
      if (!res.ok) {
        setLoginStep("failed");
        setLoginStatusMessage(data.error || "Login attempt failed.");
        return;
      }

      setLoginStatusMessage(data.message || "Login process initiated. Please wait...");
    } catch (err) {
      setLoginStep("failed");
      setLoginStatusMessage("Error connecting to login service: " + (err as Error).message);
    }
  };

  // Submit OTP / Verification code
  const handleSubmitOtp = async () => {
    if (!otpCode.trim() || otpCode.length < 4) {
      alert("Please enter a valid verification code.");
      return;
    }
    setLoginStep("authenticating");
    setLoginStatusMessage("Submitting 6-digit code and verifying active session, please wait...");
    try {
      const res = await fetch(resolveUrl("/api/submit-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otpCode })
      });
      const data = await parseResponseJson(res, { error: "Verification service not responding." });
      if (!res.ok) {
        setLoginStep("failed");
        setLoginStatusMessage(data.error || "OTP verification failed.");
        return;
      }

      setLoginStatusMessage(data.message || "OTP submitted. Verifying session, please wait...");
    } catch (err) {
      setLoginStep("failed");
      setLoginStatusMessage("Error submitting verification code: " + (err as Error).message);
    }
  };

  // Cancel login sequence
  const handleCancelLogin = async () => {
    try {
      await fetch(resolveUrl("/api/cancel-login"), { method: "POST" });
    } catch (_) {}
    setLoginStep("idle");
    setLoginStatusMessage("");
    setOtpCode("");
  };

  const handleResetLoginState = async () => {
    setLoginStep("idle");
    setLoginStatusMessage("");
    setOtpCode("");
    setEmail("");
    setPassword("");
    try {
      await fetch(resolveUrl("/api/reset-login-state"), { method: "POST" });
    } catch (_) {}
    fetchStats();
    fetchProfiles();
  };

  // State for tracking manual retry indicators
  const [individualLoading, setIndividualLoading] = useState<Record<string, "retry" | null>>({});

  // Individual Coin manual actions
  const handleRetrySingle = async (symbol: string) => {
    setIndividualLoading(prev => ({ ...prev, [symbol]: "retry" }));
    showToast(`Launching automated post for ${symbol}...`, "process");
    try {
      const res = await fetch(resolveUrl("/api/retry-single"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol })
      });
      const data = await parseResponseJson(res, { error: "Retry request failed." });
      fetchStats();
      fetchLogs();
      if (res.ok) {
        if (data.success) {
          showToast(`Successfully posted comment for ${symbol}!`, "success", 4000);
        } else {
          showToast(`Post result for ${symbol}: ${data.result?.status || "failed"}. ${data.result?.message || ""}`, "error", 5000);
        }
      } else {
        showToast(data.error || "Manual retry failed.", "error", 5000);
      }
    } catch (err) {
      showToast("Network error: " + (err as Error).message, "error", 5000);
    } finally {
      setIndividualLoading(prev => ({ ...prev, [symbol]: null }));
    }
  };

  const handleCopyAndOpenCMC = (url: string, message: string, symbol: string) => {
    try {
      if (navigator?.clipboard?.writeText && message) {
        navigator.clipboard.writeText(message);
        showToast(`Copied $${symbol} comment to clipboard! Opening CoinMarketCap...`, "success", 4000);
      } else {
        showToast(`Opening CoinMarketCap for $${symbol}...`, "info", 3000);
      }
    } catch (_) {
      showToast(`Opening CoinMarketCap for $${symbol}...`, "info", 3000);
    }
  };

  // Toggle runMode state
  const handleToggleRunMode = async (mode: string) => {
    try {
      const res = await fetch(resolveUrl("/api/set-run-mode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        const data = await parseResponseJson(res, {});
        setRunMode(data.runMode || mode);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Log filter Logic
  const filteredLogs = logsList.filter(l => {
    const matchesLevel = logFilter === "all" || l.level === logFilter;
    const matchesQuery = !logSearchQuery.trim() || l.message.toLowerCase().includes(logSearchQuery.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      
      {/* HEADER NAVBAR */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Brand & Left Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 animate-pulse flex-shrink-0">
                <Activity className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  CoinMarketCap Bot Console
                </h1>
                <p className="text-[11px] text-slate-400 hidden sm:block">Automated Community Commenting and Growth Driver</p>
              </div>
            </div>

            {/* Mobile View: Quick Account Button in Brand Row for easy touch access */}
            <div className="flex lg:hidden items-center gap-1.5">
              <button
                onClick={() => {
                  setLoginTab("profiles");
                  setShowSessionModal(true);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition duration-200 cursor-pointer ${
                  activeProfile 
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" 
                    : (sessionExists 
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" 
                      : "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 animate-pulse"
                    )
                }`}
                title="Manage Accounts and Cookie Sessions"
              >
                <Users className="h-3 w-3" />
                <span className="max-w-[90px] truncate">{activeProfile ? activeProfile.name : (sessionExists ? "Active" : "Login")}</span>
              </button>
            </div>
          </div>

          {/* TOP STATUS & CONTROLS ROW */}
          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-800 text-[11px] sm:text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
              Server: <span className="font-semibold text-emerald-400">ONLINE</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-800 text-[11px] sm:text-xs">
              <span className="text-slate-400 font-mono">OpenAI:</span>
              {apiStatus.openai ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Enabled
                </span>
              ) : (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Rule-Based
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-800 text-[11px] sm:text-xs">
              <span className="text-slate-400 font-mono">CMC:</span>
              {apiStatus.cmc ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="text-blue-400 font-bold flex items-center gap-1">
                  <Globe className="h-3 w-3" /> CG Public
                </span>
              )}
            </div>

            {/* Quick Account Switcher Dropdown - responsive across all screens */}
            {profilesList.length > 1 && (
              <div className={`flex items-center bg-slate-950 border rounded-lg px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs shadow-inner transition ${
                (isBusy || isPostingActive || isContinuousLoopActive) ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800'
              }`}>
                <span className="text-[10px] text-slate-400 font-mono mr-1.5 uppercase font-bold flex items-center gap-1">
                  {(isBusy || isPostingActive || isContinuousLoopActive) && <span title="Account switching is locked during active process">🔒</span>}
                  Active:
                </span>
                {switchingProfileId ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />
                    Switching...
                  </span>
                ) : (
                  <select
                    value={activeProfile?.id || ""}
                    disabled={isBusy || isPostingActive || isContinuousLoopActive || switchingProfileId !== null}
                    onChange={(e) => {
                      const target = profilesList.find(p => p.id === e.target.value);
                      if (target) promptSwitchProfile(target);
                    }}
                    className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-w-[120px] sm:max-w-[140px] truncate"
                    title={
                      (isBusy || isPostingActive || isContinuousLoopActive)
                        ? "Account switching locked: Click 'Stop Posting' before switching accounts"
                        : "Switch active CoinMarketCap account (asks for confirmation)"
                    }
                  >
                    {profilesList.map(p => (
                      <option key={p.id} value={p.id} className="bg-slate-900 text-white font-medium">
                        {p.name} {p.isActive ? "✓" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Desktop Account / Session Button */}
            <button
              onClick={() => {
                setLoginTab("profiles");
                setShowSessionModal(true);
              }}
              className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition duration-200 cursor-pointer ${
                activeProfile 
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" 
                  : (sessionExists 
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" 
                    : "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 animate-pulse"
                  )
              }`}
              title="Manage Accounts and Cookie Sessions"
              id="navbar-login-btn"
            >
              <Users className="h-3.5 w-3.5" />
              <span>
                {activeProfile 
                  ? `Account: ${activeProfile.name}` 
                  : (sessionExists ? "Account: Active" : "Login / Add Account")
                }
              </span>
            </button>

            {/* Admin Switch Button */}
            <button
              onClick={() => navigateTo(currentView === "admin" ? "dashboard" : "admin")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-[11px] sm:text-xs font-bold transition duration-200 cursor-pointer ${
                currentView === "admin"
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Admin & System Diagnostics Console (/admin)"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>{currentView === "admin" ? "Dashboard" : "Admin"}</span>
            </button>

            {/* NOTIFICATION ALERTS TOGGLE BUTTON */}
            <button
              onClick={toggleNotifications}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-[11px] sm:text-xs font-bold transition duration-200 cursor-pointer ${
                notificationsEnabled
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
              title={notificationsEnabled ? "Notification toasts are active. Click to mute." : "Notification toasts are muted. Click to turn ON."}
            >
              {notificationsEnabled ? (
                <Bell className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <BellOff className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="hidden sm:inline">{notificationsEnabled ? "Alerts: ON" : "Alerts: OFF"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD OR ADMIN SCREEN CONTENT BODY */}
      {currentView === "admin" ? (
        /* ADMIN SCREEN */
        <main className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full">
          {/* ADMIN HEADER & NAVIGATION */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Admin & System Console
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                    /admin
                  </span>
                </h1>
                <p className="text-xs text-slate-400">Environment runtimes, API diagnostics, cache files, and system health checks</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateTo("dashboard")}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* 1. SYSTEM ENVIRONMENT DIAGNOSTICS CARD */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl transition-all duration-350 hover:border-slate-700/80">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <span className={`p-2 rounded-lg border flex items-center justify-center ${
                  systemCheckResult?.success
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}>
                  <Activity className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-bold text-white tracking-tight text-base flex items-center gap-2">
                    System Environment Diagnostics
                    {isCheckingSystem ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    ) : systemCheckResult?.success ? (
                      <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                        Healthy
                      </span>
                    ) : (
                      <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 font-medium">
                        Issue Detected
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">Verifies backend browser runtimes, executable existence, and system libraries</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={checkSystemHealth}
                  disabled={isCheckingSystem}
                  className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isCheckingSystem ? "animate-spin" : ""}`} />
                  Re-Run Diagnostics
                </button>
              </div>
            </div>

            {!systemCheckResult ? (
              <div className="py-6 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-xs">Querying system dependencies check...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3 border-r border-slate-800/60 pr-6">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</h3>
                  
                  <div className="flex items-start gap-2.5">
                    {systemCheckResult.playwrightInstalled ? (
                      <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 mt-0.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 bg-red-500/10 text-red-400 rounded-full border border-red-500/20 mt-0.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-white font-mono">Playwright</h4>
                      <p className="text-[10px] text-slate-400">
                        {systemCheckResult.playwrightInstalled ? "Framework is installed and loaded" : "Failed to load playwright"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    {systemCheckResult.executableExists ? (
                      <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 mt-0.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 bg-red-500/10 text-red-400 rounded-full border border-red-500/20 mt-0.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-white font-mono">Chromium Binary</h4>
                      <p className="text-[10px] text-slate-400">
                        {systemCheckResult.executableExists ? "Executable exists on disk" : "No executable found at path"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    {systemCheckResult.launchStatus === "success" ? (
                      <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 mt-0.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 mt-0.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-white font-mono">Shared OS Libraries</h4>
                      <p className="text-[10px] text-slate-400">
                        {systemCheckResult.launchStatus === "success" ? "All OS dependencies satisfied" : "Missing shared libraries detected"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-3 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Environment Details</h3>
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2 text-[11px] font-mono leading-relaxed">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-slate-500">PLAYWRIGHT_BROWSERS_PATH:</span>
                        <span className="text-slate-300 truncate max-w-sm">{systemCheckResult.browsersPath}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-slate-500">Executable Path:</span>
                        <span className="text-slate-300 truncate max-w-sm" title={systemCheckResult.executablePath}>{systemCheckResult.executablePath}</span>
                      </div>
                      <div className="border-t border-slate-900 pt-2 flex flex-col gap-1">
                        <span className="text-slate-500">Verification Result:</span>
                        <span className={`font-semibold ${systemCheckResult.success ? "text-emerald-400" : "text-amber-400"}`}>
                          {systemCheckResult.message}
                        </span>
                      </div>
                    </div>
                  </div>

                  {systemCheckResult.missingLibraries.length > 0 && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl flex items-start gap-2.5 text-[10px] text-slate-400">
                      <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-amber-400">Actionable Resolution:</p>
                        <p>
                          Detected missing shared libraries in this local sandbox environment: <code className="text-amber-300">{systemCheckResult.missingLibraries.join(", ")}</code>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 2. TWO-COLUMN GRID: API SECRETS MATRIX & STORAGE CACHE MAINTENANCE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Secrets Key Matrix - High-Density Modern Deck */}
            <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700/80 transition-all duration-300">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-white tracking-tight flex items-center gap-2">
                    <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                      <Key className="h-4 w-4" />
                    </span>
                    Secrets & Credentials Matrix
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400">Server Environment</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* OpenAI Card */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    apiStatus.openaiError ? "bg-rose-950/20 border-rose-500/30" :
                    apiStatus.openai ? "bg-slate-950/80 border-slate-800" : "bg-slate-950/40 border-slate-800/60"
                  }`}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono text-slate-400 font-semibold truncate">OPENAI_API</span>
                      <span className={`w-2 h-2 rounded-full ${apiStatus.openai && !apiStatus.openaiError ? "bg-emerald-500 animate-pulse" : apiStatus.openaiError ? "bg-rose-500" : "bg-slate-600"}`} />
                    </div>
                    <div className="text-xs font-bold text-white font-mono truncate">
                      {apiStatus.openaiError ? "QUOTA LIMIT" : apiStatus.openai ? "gpt-4o-mini" : "NOT SET"}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Primary Model</span>
                  </div>

                  {/* Gemini Card */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    apiStatus.geminiError ? "bg-rose-950/20 border-rose-500/30" :
                    apiStatus.gemini ? "bg-slate-950/80 border-slate-800" : "bg-slate-950/40 border-slate-800/60"
                  }`}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono text-slate-400 font-semibold truncate">GEMINI_API</span>
                      <span className={`w-2 h-2 rounded-full ${apiStatus.gemini && !apiStatus.geminiError ? "bg-emerald-500 animate-pulse" : apiStatus.geminiError ? "bg-rose-500" : "bg-slate-600"}`} />
                    </div>
                    <div className="text-xs font-bold text-white font-mono truncate">
                      {apiStatus.geminiError ? "KEY LEAKED" : apiStatus.gemini ? "gemini-flash" : "NOT SET"}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Fallback Model</span>
                  </div>

                  {/* CMC Card */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    apiStatus.cmc ? "bg-slate-950/80 border-slate-800" : "bg-slate-950/40 border-slate-800/60"
                  }`}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono text-slate-400 font-semibold truncate">CMC_PRO_KEY</span>
                      <span className={`w-2 h-2 rounded-full ${apiStatus.cmc ? "bg-emerald-500 animate-pulse" : "bg-blue-500"}`} />
                    </div>
                    <div className="text-xs font-bold text-white font-mono truncate">
                      {apiStatus.cmc ? "PRO API ACTIVE" : "CG PUBLIC"}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Market Feed</span>
                  </div>
                </div>

                {/* Inline Alert Callout if error exists */}
                {apiStatus.openaiError && (
                  <div className="mt-3 text-[10px] bg-rose-950/30 text-rose-300 p-2.5 rounded-xl border border-rose-500/20 leading-relaxed">
                    <span className="font-bold text-rose-400 block mb-0.5">⚠️ OpenAI Quota Exceeded</span>
                    <span className="font-mono text-[9px] block text-rose-300/80 mb-1 truncate">{apiStatus.openaiError}</span>
                    <span className="text-slate-400">💡 Top up OpenAI account credits or rely on Gemini fallback.</span>
                  </div>
                )}
                {apiStatus.geminiError && (
                  <div className="mt-3 text-[10px] bg-rose-950/30 text-rose-300 p-2.5 rounded-xl border border-rose-500/20 leading-relaxed">
                    <span className="font-bold text-rose-400 block mb-0.5">⚠️ Gemini Key Leaked</span>
                    <span className="text-slate-400">Google revoked this key. Please generate a replacement key in Google AI Studio.</span>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-500 mt-4 leading-relaxed flex gap-2">
                <HelpCircle className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <span>Credentials are loaded server-side from environment variables.</span>
              </div>
            </section>

            {/* Storage, Auth & Cache Maintenance */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4.5">
                  <h2 className="font-bold text-white tracking-tight flex items-center gap-2">
                    <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                      <HardDrive className="h-4 w-4" />
                    </span>
                    Auth & Cache Storage Maintenance
                  </h2>
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                    sessionExists ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold" : "bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold"
                  }`}>
                    {sessionExists ? "State Active" : "Unconfigured"}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                    <div className="text-[11px] text-slate-400">Storage Location:</div>
                    <div className="font-mono text-emerald-400 text-[11px]">auth/state.json</div>

                    {sessionExists && sessionDetails ? (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[10px]">
                        <div>
                          <span className="text-slate-500 block">File Size:</span>
                          <span className="text-slate-300 font-medium font-mono">{(sessionDetails.sizeBytes / 1024).toFixed(2)} KB</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Last Saved:</span>
                          <span className="text-slate-300 font-medium truncate block font-mono">
                            {new Date(sessionDetails.updatedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        {activeProfile && (
                          <div className="col-span-2 pt-1.5 border-t border-slate-800">
                            <span className="text-slate-500 block">Active Account Profile:</span>
                            <span className="text-emerald-400 font-bold text-xs">{activeProfile.name}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-400 font-medium bg-amber-500/5 p-2 rounded border border-amber-500/10">
                        No active state.json session found.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setLoginTab("cookies");
                        setShowSessionModal(true);
                      }}
                      disabled={isBusy || isContinuousLoopActive}
                      className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white transition flex items-center justify-center gap-1.5 font-semibold text-xs cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="h-3.5 w-3.5" /> Configure Cookies
                    </button>
                    <button
                      onClick={() => runCommand("/api/check-login", "login")}
                      disabled={isPending.login || isBusy || isContinuousLoopActive}
                      className="py-2.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition flex items-center justify-center gap-1.5 font-semibold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isPending.login ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Verifying...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" /> Verify Login
                        </>
                      )}
                    </button>
                    {sessionExists && (
                      <button
                        onClick={() => runCommand("/api/clear-session", "login")}
                        disabled={isBusy || isContinuousLoopActive}
                        className="py-2.5 px-3 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 transition flex items-center justify-center gap-1.5 font-medium text-xs cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete state.json
                      </button>
                    )}
                    <button
                      onClick={() => runCommand("/api/clear-all", "clear")}
                      disabled={isPending.clear || isBusy || isContinuousLoopActive}
                      className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center justify-center gap-1.5 font-medium text-xs cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isPending.clear ? "animate-spin text-emerald-400" : ""}`} />
                      {isPending.clear ? "Resetting..." : "Reset Storage"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                <span className="font-semibold text-white">Notice:</span> Browser contexts and cookies are stored securely on the backend container.
              </div>
            </section>
          </div>

          {/* 3. MULTI-ACCOUNT PROFILES OVERVIEW */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-400" />
                <h2 className="font-bold text-white text-sm">Configured Account Profiles ({profilesList.length}/5)</h2>
              </div>
              <button
                onClick={() => {
                  setLoginTab("profiles");
                  setShowSessionModal(true);
                }}
                className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Manage Profiles
              </button>
            </div>

            {profilesList.length === 0 ? (
              <div className="text-slate-500 text-xs italic py-4 text-center">No account profiles saved yet. Click "Manage Profiles" to add one.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {profilesList.map((p) => (
                  <div key={p.id} className={`p-3.5 rounded-xl border transition ${p.isActive ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-950/60 border-slate-800'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white text-xs truncate max-w-[180px]">{p.name}</span>
                      {p.isActive ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold font-mono">
                          ACTIVE
                        </span>
                      ) : (
                        <button
                          onClick={() => promptSwitchProfile(p)}
                          disabled={isBusy || isPostingActive || isContinuousLoopActive || switchingProfileId !== null}
                          className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
                          title={
                            (isBusy || isPostingActive || isContinuousLoopActive)
                              ? "Cannot switch accounts while posting or automation is active. Click 'Stop Posting' first."
                              : `Switch to ${p.name}`
                          }
                        >
                          {switchingProfileId === p.id ? (
                            <>
                              <RefreshCw className="h-2.5 w-2.5 animate-spin text-emerald-400" />
                              <span>Switching...</span>
                            </>
                          ) : (isBusy || isPostingActive || isContinuousLoopActive) ? (
                            <>
                              <span>🔒</span>
                              <span>Locked</span>
                            </>
                          ) : (
                            "Activate"
                          )}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">ID: {p.id}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      ) : (
        /* MAIN BOT DASHBOARD */
        <main className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full">

        {/* ROW 1: ACTIONS & ACTIVE PROGRESS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* CONTROL PANEL CARD (7 cols) */}
          <section id="controls-panel" className="lg:col-span-7 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700/80 relative overflow-hidden group">
            {/* Ambient subtle decorative glow */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              {/* HEADER BAR */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shadow-sm shadow-blue-500/10">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-bold text-white text-sm tracking-tight flex items-center gap-1.5">
                      Control Center
                    </h2>
                    <p className="text-[11px] text-slate-400">Playwright Community Auto-Poster</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 shadow-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    status === "Posting" ? "bg-emerald-400 animate-ping" :
                    status === "Generating" ? "bg-purple-400 animate-pulse" :
                    status === "Fetching" ? "bg-blue-400 animate-pulse" :
                    status === "Authenticating" ? "bg-amber-400 animate-pulse" : "bg-slate-500"
                  }`} />
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200">
                    {status}
                  </span>
                </div>
              </div>

              {/* RUN MODE STRIP */}
              <div className="mb-4 px-3.5 py-2 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-2 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Engine: <strong className="text-white font-semibold">Real Browser (Headless Playwright)</strong>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  Anti-Detection Active
                </span>
              </div>

              {/* 2x2 MODERN ACTION DECK */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Check Session */}
                <button
                  onClick={() => runCommand("/api/check-login", "login")}
                  disabled={isPending.login || isBusy || isContinuousLoopActive}
                  className="p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-login"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500/20 border border-emerald-500/20 transition">
                      <CheckCircle className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition">Check Session</h3>
                      <p className="text-[10px] text-slate-400">Verify login state</p>
                    </div>
                  </div>
                  {isPending.login ? (
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-400 animate-spin" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition" />
                  )}
                </button>

                {/* 2. Fetch Trending */}
                <button
                  onClick={async () => {
                    if (coinsList.length > 0) {
                      setShowConfirmFetchModal(true);
                    } else {
                      await runCommand("/api/fetch-trending", "fetch");
                    }
                  }}
                  disabled={isPending.fetch || isPending.clear || isBusy || isContinuousLoopActive}
                  className="p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-fetch"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20 border border-blue-500/20 transition">
                      <Search className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-blue-300 transition">Fetch Trending</h3>
                      <p className="text-[10px] text-slate-400">
                        {coinsList.length > 0
                          ? (coinsFetchedAt ? `Fetched: ${formatTimeAgo(coinsFetchedAt).text}` : "Fetched: Prev session")
                          : "Load top coin list"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {coinsList.length > 0 && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border hidden sm:inline-block ${
                        coinsFetchedAt
                          ? (formatTimeAgo(coinsFetchedAt).isVeryStale 
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                              : formatTimeAgo(coinsFetchedAt).isStale 
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                : "bg-blue-500/10 text-blue-400 border-blue-500/20")
                          : "bg-slate-800/80 text-slate-400 border-slate-700/80"
                      }`} title={coinsFetchedAt ? `Exact fetch time: ${formatTimeAgo(coinsFetchedAt).full}` : "Coins loaded from previous session. Click Fetch Trending to get fresh coins with live timer."}>
                        {coinsFetchedAt ? formatTimeAgo(coinsFetchedAt).text : "Prev Session"}
                      </span>
                    )}
                    {isPending.fetch ? (
                      <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition" />
                    )}
                  </div>
                </button>

                {/* 3. Generate Comments */}
                <button
                  onClick={async () => {
                    if (coinsList.length === 0) {
                      showToast("Cannot generate comments: Trending coins list is empty. Please fetch trending data first.", "error");
                      return;
                    }
                    if (messagesList.length > 0) {
                      setShowConfirmGenerateModal(true);
                    } else {
                      await runCommand("/api/generate-messages", "generate");
                    }
                  }}
                  disabled={isPending.generate || isBusy || isContinuousLoopActive}
                  className="p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-generate"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover:bg-purple-500/20 border border-purple-500/20 transition">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-purple-300 transition">Generate Comments</h3>
                      <p className="text-[10px] text-slate-400">
                        {messagesList.length > 0
                          ? (commentsGeneratedAt ? `Gen: ${formatTimeAgo(commentsGeneratedAt).text}` : "Gen: Prev session")
                          : "AI gpt-4o-mini"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {messagesList.length > 0 && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border hidden sm:inline-block ${
                        commentsGeneratedAt
                          ? (formatTimeAgo(commentsGeneratedAt).isVeryStale 
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                              : formatTimeAgo(commentsGeneratedAt).isStale 
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                : "bg-purple-500/10 text-purple-400 border-purple-500/20")
                          : "bg-slate-800/80 text-slate-400 border-slate-700/80"
                      }`} title={commentsGeneratedAt ? `Exact generation time: ${formatTimeAgo(commentsGeneratedAt).full}` : "Comments loaded from previous session. Click Generate Comments to generate fresh commentary with live timer."}>
                        {commentsGeneratedAt ? formatTimeAgo(commentsGeneratedAt).text : "Prev Session"}
                      </span>
                    )}
                    {isPending.generate ? (
                      <RefreshCw className="h-3.5 w-3.5 text-purple-400 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition" />
                    )}
                  </div>
                </button>

                {/* 4. Start / Stop Posting */}
                {(status === "Posting" || status === "Stopping" || isContinuousLoopActive || isStoppingPost) ? (
                  <button
                    onClick={() => runCommand("/api/stop-posting", "post")}
                    disabled={isPending.post || isStoppingPost || status === "Stopping"}
                    className="p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                    id="btn-pause"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`p-2 rounded-lg border transition ${
                        (isStoppingPost || status === "Stopping")
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse"
                      }`}>
                        {(isStoppingPost || status === "Stopping") ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-amber-300" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <h3 className="text-xs font-bold text-white">
                          {(isStoppingPost || status === "Stopping") ? "Stopping Engine..." : "Stop Posting"}
                        </h3>
                        <p className="text-[10px] text-rose-300/80">
                          {(isStoppingPost || status === "Stopping") ? "Halting safely..." : "Halt sequence"}
                        </p>
                      </div>
                    </div>
                    {(isStoppingPost || status === "Stopping" || isPending.post) ? (
                      <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold border border-amber-500/30 flex items-center gap-1">
                        <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Stopping
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase bg-rose-500/20 px-2 py-0.5 rounded font-bold border border-rose-500/30">Active</span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (coinsList.length === 0) {
                        showToast("Cannot start posting: Trending coins list is empty. Please fetch trending data first.", "error");
                        return;
                      }
                      if (messagesList.length === 0) {
                        showToast("Cannot start posting: Generated comments are empty. Please generate comments first.", "error");
                        return;
                      }
                      setIsStartingPost(true);
                      await runCommand("/api/post-chat", "post");
                    }}
                    disabled={isPending.post || isStartingPost || isBusy || isContinuousLoopActive}
                    className="p-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                    id="btn-start"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 group-hover:scale-105 transition-transform">
                        {isStartingPost ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                        ) : (
                          <Play className="h-4 w-4 fill-emerald-400" />
                        )}
                      </span>
                      <div>
                        <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition">
                          {isStartingPost ? "Starting..." : "Start Posting"}
                        </h3>
                        <p className="text-[10px] text-slate-400">Launch real browser</p>
                      </div>
                    </div>
                    {isStartingPost || isPending.post ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* FULL AUTOMATION SEQUENCE & CONTINUOUS LOOP */}
            <div className="mt-4 pt-3 flex flex-col gap-3 relative z-10">
              <button
                onClick={() => runCommand("/api/full-flow", "full", { continuous: isContinuousLoopActive, intervalMinutes: continuousInterval })}
                disabled={isPending.full || isBusy || isContinuousLoopActive}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-[0.99] flex items-center justify-center gap-2 font-black text-xs shadow-md disabled:opacity-40 cursor-pointer"
                id="btn-full-flow"
              >
                {isPending.full ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Run Full Automated Bot Cycle
              </button>

              {/* CONTINUOUS LOOP REFINED CONTROLLER - SEAMLESS DESIGN */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/60 flex flex-col gap-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <label className={`relative inline-flex items-center ${isBusy && !isContinuousLoopActive ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={isContinuousLoopActive}
                        disabled={isBusy && !isContinuousLoopActive}
                        onChange={(e) => toggleContinuousLoop(e.target.checked, continuousInterval)}
                        className="sr-only peer"
                        id="chk-continuous"
                      />
                      <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-slate-950 peer-checked:after:border-transparent peer-disabled:opacity-40 shadow-inner"></div>
                    </label>
                    <div>
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        Continuous Automation Loop
                        {isContinuousLoopActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 block">Auto-restarts cycle after cooldown gap</span>
                    </div>
                  </div>

                  <button
                    onClick={() => runCommand("/api/clear-all", "clear")}
                    disabled={isPending.clear || isBusy || isContinuousLoopActive}
                    className="text-red-400/80 hover:text-red-300 text-[10px] font-semibold flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 disabled:opacity-40 cursor-pointer"
                    id="btn-clear-stats"
                    title="Reset storage and clear local data"
                  >
                    <Trash2 className="h-3 w-3" /> Reset Storage
                  </button>
                </div>

                {/* Interval slider & Quick preset buttons */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-medium">Cooldown Gap:</span>
                    <div className="flex items-center gap-1.5">
                      {[5, 15, 30, 60].map((preset) => (
                        <button
                          key={preset}
                          disabled={isContinuousLoopActive}
                          onClick={() => {
                            setContinuousInterval(preset);
                            saveIntervalToServer(preset);
                          }}
                          className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                            continuousInterval === preset
                              ? "bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20"
                              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80"
                          } disabled:opacity-40 cursor-pointer`}
                        >
                          {preset}m
                        </button>
                      ))}
                      <span className="text-emerald-400 font-mono font-bold ml-1">{continuousInterval}m</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min="1"
                      max="120"
                      value={continuousInterval}
                      onChange={(e) => setContinuousInterval(Number(e.target.value))}
                      onMouseUp={() => saveIntervalToServer(continuousInterval)}
                      onTouchEnd={() => saveIntervalToServer(continuousInterval)}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                      id="slider-interval"
                      title="Adjust cooldown gap between automated cycles"
                    />
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={continuousInterval}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value));
                        setContinuousInterval(val);
                        saveIntervalToServer(val);
                      }}
                      className="w-12 bg-slate-900 border border-slate-800/80 rounded-lg px-1.5 py-0.5 text-center text-[10px] font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50 shadow-inner"
                      id="num-interval"
                      title="Cooldown minutes between automated cycles"
                    />
                  </div>
                </div>

                {/* Isolated Countdown Component that never causes main App re-render lag */}
                {isContinuousLoopActive && (
                  <CycleCountdown nextCycleStartTime={nextCycleStartTime} />
                )}
              </div>
            </div>
          </section>

          {/* ACTIVE PROGRESS / EXECUTION MONITOR (5 cols) */}
          <section className="lg:col-span-5 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700/80 relative overflow-hidden group">
            {/* Ambient subtle decorative glow */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-3 relative z-10">
              {/* HEADER */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-bold text-white text-sm tracking-tight">Execution Monitor</h2>
                    <p className="text-[11px] text-slate-400">Live Post & Batch Metrics</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 shadow-sm">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    status === "Stopping" ? "bg-amber-400 animate-spin" :
                    status !== "Idle" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                  }`} />
                  <span className="text-[10px] font-mono text-slate-300 font-semibold uppercase">
                    {status === "Stopping" ? "Halting" : (status !== "Idle" ? "Active" : "Standby")}
                  </span>
                </div>
              </div>

              {/* CURRENT COIN SPOTLIGHT CARD */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-between shadow-inner">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-bold">Target Asset</span>
                  <div className="text-lg font-black text-white font-mono tracking-tight flex items-center gap-2">
                    {status === "Stopping" || isStoppingPost ? (
                      <span className="text-amber-400 flex items-center gap-1.5 text-sm font-bold">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Stopping Engine
                      </span>
                    ) : isStartingPost ? (
                      <span className="text-emerald-400 flex items-center gap-1.5 text-sm font-bold">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Starting Engine...
                      </span>
                    ) : currentCoin !== "N/A" ? (
                      currentCoin
                    ) : (
                      "IDLE"
                    )}
                    {status === "Posting" && currentCoin !== "N/A" && (
                      <span className="text-[10px] font-sans font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        In Progress
                      </span>
                    )}
                    {(status === "Stopping" || isStoppingPost) && (
                      <span className="text-[10px] font-sans font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Halting Step
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {status === "Stopping" || isStoppingPost
                      ? "Gracefully stopping sequence... Waiting for current browser action to complete"
                      : isStartingPost
                      ? "Launching browser automation engine..."
                      : `Coin #${totalCoins > 0 ? progressIndex + 1 : 0} of ${totalCoins || 0} in active batch`}
                  </span>
                </div>

                <div className="text-right">
                  <div className="text-3xl font-black font-mono text-emerald-400 tracking-tight">
                    {totalCoins > 0 ? Math.round((progressIndex / totalCoins) * 100) : 0}%
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono uppercase font-semibold">Completed</span>
                </div>
              </div>

              {/* 4-METRIC KPI GRID */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Total Coins</span>
                  <div className="text-base font-black text-slate-200 font-mono mt-0.5">{totalCoins}</div>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Comments AI</span>
                  <div className="text-base font-black text-purple-400 font-mono mt-0.5">{generatedCount}</div>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Submitted</span>
                  <div className="text-base font-black text-emerald-400 font-mono mt-0.5">{postedCount}</div>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Remaining</span>
                  <div className="text-base font-black text-amber-400 font-mono mt-0.5">{Math.max(0, totalCoins - progressIndex)}</div>
                </div>
              </div>
            </div>

            {/* BATCH PROGRESS BAR */}
            <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2 relative z-10">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400 text-[11px]">Batch Progress Track</span>
                <span className="text-emerald-400 font-bold text-[11px] font-mono">
                  {progressIndex} / {totalCoins} coins
                </span>
              </div>

              {/* Glowing High-Tech Neon Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out shadow-sm shadow-emerald-500/30"
                  style={{ width: `${totalCoins > 0 ? (progressIndex / totalCoins) * 100 : 0}%` }}
                ></div>
              </div>

              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-0.5">
                <span>Success Rate: <strong className="text-slate-300 font-semibold">{postedCount + failedCount > 0 ? Math.round((postedCount / (postedCount + failedCount)) * 100) : 100}%</strong></span>
                <span>Active Profile: <strong className="text-emerald-400 font-semibold">{activeProfile?.name || "Active"}</strong></span>
              </div>

              {coinsList.length > 0 && (
                <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-400 pt-1.5 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-500" />
                    Coins: <strong className={formatTimeAgo(coinsFetchedAt).isStale ? "text-amber-400" : "text-emerald-400"}>{formatTimeAgo(coinsFetchedAt).text}</strong>
                  </span>
                  {messagesList.length > 0 && (
                    <span className="flex items-center gap-1">
                      Comments: <strong className={formatTimeAgo(commentsGeneratedAt).isStale ? "text-amber-400" : "text-purple-400"}>{formatTimeAgo(commentsGeneratedAt).text}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

        </div>

        {/* ROW 2: LOG CONSOLE TERMINAL (Full width) */}
        <section className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="flex flex-col gap-3.5 mb-3.5 border-b border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-white tracking-tight flex items-center gap-2">
                    <span className="p-1.5 bg-slate-800 text-emerald-400 rounded-lg border border-slate-700">
                      <TerminalIcon className="h-4 w-4" />
                    </span>
                    Interactive Logs Console
                  </h2>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800 font-medium" title="Logs are kept to a maximum of 100 entries with automatic rotation to prevent memory leaks">
                    Ring Buffer: {filteredLogs.length}/100 max (auto-rotates)
                  </span>
                </div>
                <button
                  onClick={() => runCommand("/api/clear-all", "clear")}
                  disabled={isPending.clear || isBusy || isContinuousLoopActive}
                  className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500"
                  title="Clear console"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Search query input */}
                <input
                  type="text"
                  placeholder="Filter logs by keyword..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500 placeholder-slate-600 font-mono"
                />

                {/* Auto-scroll toggle indicator/button */}
                <button
                  onClick={() => {
                    const nextVal = !autoScroll;
                    setAutoScroll(nextVal);
                    if (nextVal && terminalContainerRef.current) {
                      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
                    }
                  }}
                  className={`px-2 py-1 text-[10px] font-bold rounded border transition flex items-center gap-1 cursor-pointer ${
                    autoScroll
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                  title={autoScroll ? "Pause auto-scrolling when new logs arrive" : "Resume auto-scrolling to the bottom"}
                >
                  <ArrowDown className={`h-3 w-3 ${autoScroll ? "animate-pulse" : ""}`} />
                  Scroll: {autoScroll ? "ON" : "PAUSED"}
                </button>

                {/* Log level selector */}
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-semibold text-slate-400 cursor-pointer focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">ALL LOGS</option>
                  <option value="info">INFO</option>
                  <option value="success">SUCCESS</option>
                  <option value="warning">WARNING</option>
                  <option value="error">ERROR</option>
                </select>
              </div>
            </div>

            {/* Terminal console */}
            <div 
              ref={terminalContainerRef}
              className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[360px] overflow-y-auto font-mono text-[11px] space-y-1.5 leading-relaxed shadow-inner"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-slate-600 italic text-center pt-12">No console messages matching filter.</div>
              ) : (
                filteredLogs.slice(-100).map((log, index) => {
                  let colorClass = "text-slate-300";
                  if (log.level === "success") colorClass = "text-emerald-400";
                  else if (log.level === "warning") colorClass = "text-amber-400";
                  else if (log.level === "error") colorClass = "text-red-400 font-semibold";
                  else if (log.level === "info") colorClass = "text-blue-400";

                  return (
                    <div key={index} className="flex gap-2 items-start hover:bg-slate-900/40 p-0.5 rounded transition">
                      <span className="text-slate-600 flex-shrink-0 select-none">[{log.timestamp}]</span>
                      <span className={colorClass}>{log.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef}></div>
            </div>
          </section>

        {/* ROW 3: STORAGE AND REPORTS DATA EXPLORER (Full width) */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                <Database className="h-5 w-5" />
              </span>
              Storage & Report Explorer
            </h2>

            {/* Exporter selector tabs */}
            <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab("coins")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "coins" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Trending Coins
              </button>
              <button
                onClick={() => setActiveTab("comments")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "comments" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. Generated Comments
              </button>
              <button
                onClick={() => setActiveTab("results")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "results" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Post Submissions ({results.length})
              </button>
              <button
                onClick={() => setActiveTab("reports")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "reports" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                4. CSV Exports & Reports
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
                    <span className="text-xs text-slate-400 font-mono">
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
                      }`} title={coinsFetchedAt ? `Exact fetch time: ${formatTimeAgo(coinsFetchedAt).full}` : "Coins loaded from previous session. Click Fetch Trending to get fresh coins with live timer."}>
                        <Clock className="h-3 w-3" />
                        {coinsFetchedAt 
                          ? `Fetched: ${formatTimeAgo(coinsFetchedAt).text} (${formatTimeAgo(coinsFetchedAt).full})`
                          : "Fetched: Previous Session (Click Fetch Trending to update)"}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshingData}
                    className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingData ? "animate-spin" : ""}`} />
                    Refresh Coins
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                  <table className="w-full text-left text-xs border border-slate-700/80 border-collapse min-w-[900px]">
                    <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] tracking-wider border-b border-slate-700/80 font-mono font-bold">
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
                                If you recently switched profiles, the browser data might not have synchronized yet. Click <strong>"Refresh Coins"</strong> above, or trigger <strong>"Fetch Trending"</strong> in the Control Center to populate.
                              </p>
                              <button
                                onClick={handleManualRefresh}
                                disabled={isRefreshingData}
                                className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
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
            {activeTab === "comments" && (() => {
              const pendingCoins = messagesList.filter(msgItem => !results.some(r => r.symbol.toLowerCase() === msgItem.symbol.toLowerCase()));
              const failedCoins = messagesList.filter(msgItem => results.some(r => r.symbol.toLowerCase() === msgItem.symbol.toLowerCase() && r.status !== "success"));
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs text-slate-400 font-mono">
                        Showing {messagesList.length} generated comments ({pendingCoins.length} pending, {failedCoins.length} failed)
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
                        }`} title={commentsGeneratedAt ? `Exact generation time: ${formatTimeAgo(commentsGeneratedAt).full}` : "Comments loaded from previous session. Click Generate Comments to generate fresh commentary with live timer."}>
                          <Clock className="h-3 w-3" />
                          {commentsGeneratedAt 
                            ? `Generated: ${formatTimeAgo(commentsGeneratedAt).text} (${formatTimeAgo(commentsGeneratedAt).full})`
                            : "Generated: Previous Session (Click Generate Comments to update)"}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleManualRefresh}
                      disabled={isRefreshingData}
                      className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingData ? "animate-spin" : ""}`} />
                      Refresh Comments
                    </button>
                  </div>

                  {messagesList.length === 0 ? (
                    <div className="p-12 bg-slate-950/60 border border-slate-800 rounded-2xl text-center text-slate-400 space-y-3">
                      <div className="text-slate-500 font-medium">No generated comments found in storage for this profile.</div>
                      <div className="text-xs text-slate-400 max-w-md mx-auto">
                        Comments must be generated before they can be posted. If you recently switched profiles or expect data, click the <strong className="text-emerald-400">"Refresh Comments"</strong> button above, or trigger <strong className="text-purple-400">"Generate Comments"</strong> in the Control Center.
                      </div>
                      <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshingData}
                        className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                        Refresh Now
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Active Automated Posting Queue */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Active Automated Posting Queue ({pendingCoins.length} coins pending)
                        </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                      <table className="w-full text-left text-xs border border-slate-700/80 border-collapse min-w-[750px]">
                        <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] tracking-wider border-b border-slate-700/80 font-mono font-bold">
                          <tr>
                            <th className="py-3 px-4 w-[100px] border-r border-slate-700/80 whitespace-nowrap">Sequence</th>
                            <th className="py-3 px-4 w-[150px] border-r border-slate-700/80 whitespace-nowrap">Asset</th>
                            <th className="py-3 px-4 w-[120px] border-r border-slate-700/80 whitespace-nowrap">Sentiment</th>
                            <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Comment Message</th>
                            <th className="py-3 px-4 text-right w-[150px] whitespace-nowrap">Link</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                          {pendingCoins.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-500 italic">
                                No pending coins in queue. All coins have been processed!
                              </td>
                            </tr>
                          ) : (
                            pendingCoins.map((item, index) => (
                              <tr key={index} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                                <td className="py-4 px-4 font-mono border-r border-slate-800/80">
                                  <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 font-bold">
                                    Seq #{index + 1}
                                  </span>
                                </td>
                                <td className="py-4 px-4 font-bold text-white border-r border-slate-800/80">
                                  <div className="leading-none">{item.name}</div>
                                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{item.symbol}</span>
                                </td>
                                <td className="py-4 px-4 border-r border-slate-800/80">
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
                                <td className="py-4 px-4 font-mono text-slate-300 leading-relaxed italic border-r border-slate-800/80">
                                  "{item.message}"
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-semibold"
                                  >
                                    Open <ChevronRight className="h-3 w-3" />
                                  </a>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Failed/Unsuccessful Submissions */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Failed / Unsuccessful Submissions ({failedCoins.length} failures)
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-rose-900/50 shadow-md bg-slate-950/70">
                      <table className="w-full text-left text-xs border border-rose-900/40 border-collapse min-w-[750px]">
                        <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] tracking-wider border-b border-rose-900/50 font-mono font-bold">
                          <tr>
                            <th className="py-3 px-4 w-[150px] border-r border-rose-900/40 whitespace-nowrap">Asset</th>
                            <th className="py-3 px-4 w-[120px] border-r border-rose-900/40 whitespace-nowrap">Sentiment</th>
                            <th className="py-3 px-4 border-r border-rose-900/40 whitespace-nowrap">Error/Status Details</th>
                            <th className="py-3 px-4 text-center w-[150px] border-r border-rose-900/40 whitespace-nowrap">Interactive Control</th>
                            <th className="py-3 px-4 text-right w-[150px] whitespace-nowrap">Link</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                          {failedCoins.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-500 italic">
                                No unsuccessful submissions found. Smooth sailing!
                              </td>
                            </tr>
                          ) : (
                            failedCoins.map((item, index) => {
                              const resEntry = results.find(r => r.symbol.toLowerCase() === item.symbol.toLowerCase());
                              return (
                                <tr key={index} className="hover:bg-slate-800/40 transition-colors bg-rose-500/[0.03]">
                                  <td className="py-4 px-4 font-bold text-white border-r border-slate-800/80">
                                    <div className="leading-none">{item.name}</div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{item.symbol}</span>
                                  </td>
                                  <td className="py-4 px-4 border-r border-slate-800/80">
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
                                  <td className="py-4 px-4 text-slate-300 font-mono text-[11px] border-r border-slate-800/80">
                                    <div className="text-rose-400 font-bold mb-1 flex items-center gap-1.5">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      {resEntry ? resEntry.status.toUpperCase() : "FAILED"}
                                    </div>
                                    <div className="text-slate-400 italic">
                                      {resEntry ? resEntry.message : "Submission failed"}
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-center border-r border-slate-800/80">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => handleRetrySingle(item.symbol)}
                                        disabled={individualLoading[item.symbol] !== null || isBusy}
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold font-mono text-[10px] tracking-wide border border-emerald-500/25 transition flex items-center gap-1.5 disabled:opacity-50 disabled:hover:bg-emerald-500/10 disabled:hover:text-emerald-400 cursor-pointer"
                                        title="Bot auto-posts this coin via Playwright browser"
                                      >
                                        {individualLoading[item.symbol] === "retry" ? (
                                          <RefreshCw className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Play className="h-3 w-3 fill-current" />
                                        )}
                                        Auto Retry
                                      </button>
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => {
                                          const msgEntry = messagesList.find(m => m.symbol.toLowerCase() === item.symbol.toLowerCase());
                                          handleCopyAndOpenCMC(item.url, msgEntry ? msgEntry.message : item.message, item.symbol);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-slate-950 font-bold font-mono text-[10px] tracking-wide border border-blue-500/25 transition flex items-center gap-1 cursor-pointer"
                                        title="Copies comment to clipboard and opens CoinMarketCap to post manually"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        Manual Post
                                      </a>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-rose-400 hover:text-rose-300 hover:underline inline-flex items-center gap-1 font-semibold"
                                    >
                                      Open <ChevronRight className="h-3 w-3" />
                                    </a>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

            {/* TAB 3: SUBMISSION RESULTS */}
            {activeTab === "results" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 font-mono">
                    Showing submission history and queue status ({results.length} posted results)
                  </span>
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshingData}
                    className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 transition duration-200 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingData ? "animate-spin" : ""}`} />
                    Refresh Submissions
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                  <table className="w-full text-left text-xs border border-slate-700/80 border-collapse min-w-[850px]">
                    <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] tracking-wider border-b border-slate-700/80 font-mono font-bold">
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
                      {messagesList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 px-4 text-center text-slate-400">
                            <div className="space-y-3 max-w-md mx-auto">
                              <p className="text-slate-500 font-medium">No generated comments or submissions found for this profile.</p>
                              <p className="text-[11px] text-slate-400">
                                If you recently switched profiles, the browser data might not have synchronized yet. Click <strong>"Refresh Submissions"</strong> above, or trigger <strong>"Generate Comments"</strong> or <strong>"Full Cycle"</strong> in the Control Center to populate.
                              </p>
                              <button
                                onClick={handleManualRefresh}
                                disabled={isRefreshingData}
                                className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                                Refresh Now
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (() => {
                      const pendingItems = messagesList.filter(msgItem => !results.some(r => r.symbol.toLowerCase() === msgItem.symbol.toLowerCase()));
                      return messagesList.map((msgItem, index) => {
                        const item = results.find(r => r.symbol.toLowerCase() === msgItem.symbol.toLowerCase());
                        const pendingIndex = pendingItems.findIndex(p => p.symbol.toLowerCase() === msgItem.symbol.toLowerCase());
                        const seqStr = pendingIndex !== -1 ? `Seq #${pendingIndex + 1}` : "";
                        
                        return (
                          <tr key={index} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                            <td className="py-3.5 px-4 font-mono text-slate-400 border-r border-slate-800/80">
                              {item ? (item.timestamp || "N/A") : "Pending"}
                            </td>
                            <td className="py-3.5 px-4 border-r border-slate-800/80">
                              <div className="font-bold text-white leading-none">{msgItem.name}</div>
                              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{msgItem.symbol}</span>
                            </td>
                            <td className="py-3.5 px-4 font-bold border-r border-slate-800/80">
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
                            <td className="py-3.5 px-4 font-semibold border-r border-slate-800/80">
                              {!item ? (
                                <span className="text-slate-400 flex items-center gap-1.5 font-medium font-mono">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"></span>
                                  In Queue {seqStr && <span className="text-[10px] text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-800 font-bold ml-1">{seqStr}</span>}
                                </span>
                              ) : item.status === "skipped" ? (
                                <span className="text-slate-400 flex items-center gap-1 font-bold">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Skipped (DEX)
                                </span>
                              ) : item.status === "success" ? (
                                <span className="text-emerald-400 flex items-center gap-1 font-bold">
                                  <CheckCircle className="h-3.5 w-3.5" /> Post Submitted
                                </span>
                              ) : item.status === "captcha" ? (
                                <span className="text-amber-400 flex items-center gap-1 font-bold">
                                  <AlertTriangle className="h-3.5 w-3.5 animate-bounce" /> Captcha Detected
                                </span>
                              ) : (
                                <span className="text-red-400 flex items-center gap-1 font-bold">
                                  <AlertTriangle className="h-3.5 w-3.5" /> {item.status.toUpperCase()}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px] max-w-xs truncate border-r border-slate-800/80" title={item ? item.message : msgItem.message}>
                              {item ? item.message : `Generated: "${msgItem.message.substring(0, 40)}..."`}
                            </td>
                            
                             {/* Manual post retry controls */}
                            <td className="py-3.5 px-4 text-center border-r border-slate-800/80">
                              {item && item.status !== "success" ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleRetrySingle(msgItem.symbol)}
                                    disabled={individualLoading[msgItem.symbol] !== null || isBusy}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold font-mono text-[10px] tracking-wide border border-emerald-500/25 transition flex items-center gap-1 disabled:opacity-50 disabled:hover:bg-emerald-500/10 disabled:hover:text-emerald-400 cursor-pointer"
                                    title="Bot auto-posts this coin via Playwright browser"
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

                            <td className="py-3.5 px-4 text-right">
                              <a
                                href={msgItem.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-semibold"
                              >
                                Verify <ChevronRight className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

            {/* TAB 4: CSV EXPORTS & REPORTS */}
            {activeTab === "reports" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 font-mono">
                    Download analytical reports and raw data sheets for external use
                  </span>
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshingData}
                    className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 transition duration-200 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingData ? "animate-spin" : ""}`} />
                    Refresh Reports
                  </button>
                </div>

                <div className="space-y-8">
                {/* 4.1. CSV Exporters Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-sm">Trending Coins CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Complete log report containing details of the top trending assets, dynamic live price changes, ranks, and coin URLs.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/trending_coins.csv")}
                      onClick={() => showToast("Downloading Trending Coins CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-sm">Generated Comments CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Complete listing of generated custom comments ready for automated Playwright commenting.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/generated_comments.csv")}
                      onClick={() => showToast("Downloading Generated Comments CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-purple-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-sm">Post Submissions CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Detailed execution outcome logs representing each individual automated browser posting session.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/post_submissions.csv")}
                      onClick={() => showToast("Downloading Post Submissions CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-sm">Overall Report CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        High-level summary representing overall run health, conversion rates, counts, and bot execution parameters.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/overall_report.csv")}
                      onClick={() => showToast("Downloading Overall Audit Report CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-amber-400" /> Download CSV
                    </a>
                  </div>

                </div>

                {/* 4.2. Beautiful Interactive Analytics Center */}
                <div className="pt-6 border-t border-slate-800">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Success Rate Pie Chart (Radial SVG Chart) */}
                    <div className="lg:col-span-5 bg-slate-950 p-5 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center space-y-4">
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider text-center">Submission Success Rate</h4>
                      
                      {results.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500 italic">
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
                              <div className="text-sm font-bold text-emerald-400 font-mono">
                                {results.filter(r => r.status === "success").length} / {results.filter(r => r.status !== "skipped").length}
                              </div>
                            </div>
                            <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40">
                              <div className="text-[10px] text-slate-400 font-medium">Failed / Skipped</div>
                              <div className="text-sm font-bold text-rose-400 font-mono">
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
                        <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-4">Sentiment & Channel Statistics</h4>
                        
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
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
                            <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
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
                            <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
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
                        <span className="font-bold text-slate-200">System Insight:</span> Real-time sentiment categorization uses your generated OpenAI comments database. Ensure your Playwright State credentials in auth/state.json remain updated to maintain maximum success rates.
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )}

          </div>
        </section>

      </main>
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p className="tracking-wide">CoinMarketCap Automated Community Bot Control Panel © 2026. All rights reserved.</p>
      </footer>

      {/* MODAL: PASTE COOKIE SESSION OR LOGIN */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-5 pb-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                  <Key className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-white text-sm">
                  Configure Playwright Session
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowSessionModal(false);
                  handleResetLoginState();
                }}
                className="text-slate-400 hover:text-white transition font-bold font-mono text-sm"
              >
                ✕
              </button>
            </div>

            {/* Tab Selection */}
            <div className="px-5 pt-3 flex gap-4 border-b border-slate-800 bg-slate-950/20">
              <button
                onClick={() => {
                  setLoginTab("credentials");
                  if (loginStep === "success" || loginStep === "failed") {
                    handleResetLoginState();
                  }
                }}
                disabled={isBusy || isContinuousLoopActive}
                className={`pb-3 text-xs font-bold transition-all relative disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  loginTab === "credentials" ? "text-emerald-400 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Automated Login (New)
              </button>
              <button
                onClick={() => setLoginTab("cookies")}
                disabled={isBusy || isContinuousLoopActive}
                className={`pb-3 text-xs font-bold transition-all relative disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  loginTab === "cookies" ? "text-emerald-400 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. Paste state.json cookies
              </button>
              <button
                onClick={() => {
                  setLoginTab("profiles");
                  if (loginStep === "success") {
                    handleResetLoginState();
                  }
                }}
                disabled={isBusy || isContinuousLoopActive}
                className={`pb-3 text-xs font-bold transition-all relative disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  loginTab === "profiles" ? "text-emerald-400 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Switch Accounts ({profilesList.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">

              {loginTab === "credentials" && (
                <div className="space-y-4 text-xs">
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Log in directly using your CoinMarketCap credentials. Our backend Playwright browser will run the login, handle security, and capture/save the <code className="text-emerald-400 font-mono">state.json</code> automatically!
                  </p>

                  {loginStep === "idle" && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-400 font-mono tracking-widest font-bold">Email Address</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your-email@example.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-700"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-400 font-mono tracking-widest font-bold">Password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-700"
                        />
                      </div>
                      <button
                        onClick={handleStartLogin}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
                      >
                        Start Automated Login Process
                      </button>
                    </div>
                  )}

                  {loginStep === "authenticating" && (
                    <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="relative">
                        <RefreshCw className="h-10 w-10 text-emerald-400 animate-spin" />
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
                      </div>
                      <div className="space-y-1.5 max-w-sm">
                        <h4 className="font-bold text-white text-sm">Processing CoinMarketCap Authentication...</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{loginStatusMessage}</p>
                      </div>
                      <div className="w-full bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 text-[10px] text-slate-400 space-y-1.5 text-left font-mono">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                          <CheckCircle className="h-3 w-3" /> Secure Playwright browser context launched
                        </div>
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                          <CheckCircle className="h-3 w-3" /> Credentials submitted to CoinMarketCap
                        </div>
                        <div className="flex items-center gap-2 text-amber-400 animate-pulse font-semibold">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Capturing cookies, tokens, & anti-bot clearance...
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
                          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmitOtp}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold"
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
                        <h4 className="font-bold text-white text-sm">Authentication Succeeded!</h4>
                        <p className="text-[11px] text-slate-300 max-w-sm">{loginStatusMessage || "Your CoinMarketCap session has been captured and validated successfully."}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full pt-1">
                        <button
                          onClick={() => {
                            setShowSessionModal(false);
                            handleResetLoginState();
                          }}
                          className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-sm"
                        >
                          Finish & Close
                        </button>
                        <button
                          onClick={() => {
                            handleResetLoginState();
                            setLoginTab("credentials");
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          ➕ Add Another Account
                        </button>
                        <button
                          onClick={() => {
                            handleResetLoginState();
                            setLoginTab("profiles");
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          👥 Switch Accounts ({profilesList.length})
                        </button>
                      </div>
                    </div>
                  )}

                  {loginStep === "failed" && (
                    <div className="space-y-4">
                      <div className="p-5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400 flex flex-col items-center text-center space-y-3">
                        <AlertTriangle className="h-10 w-10 text-rose-400" />
                        <div className="space-y-1">
                          <h4 className="font-bold text-white text-sm">Login Attempt Notice</h4>
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
                              const res = await fetch(resolveUrl("/api/check-login"), { method: "POST" });
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
                          className="w-full py-2.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                        >
                          <Search className="h-3.5 w-3.5" /> Check If Already Logged In / Verify Session
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelLogin}
                          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition"
                        >
                          Close
                        </button>
                        <button
                          onClick={handleResetLoginState}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold cursor-pointer transition shadow-sm"
                        >
                          Retry Login (Re-enter)
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {loginTab === "cookies" && (
                <div className="space-y-3.5 text-xs text-slate-300">
                  <p>
                    Directly paste your existing CoinMarketCap <strong>login cookie storage state</strong> JSON array if you prefer not to enter your credentials.
                  </p>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
                    <span className="font-bold text-white block">How to obtain cookies manually:</span>
                    1. Log into your account on CoinMarketCap in Chrome.<br />
                    2. Use a browser extension like "EditThisCookie" or Playwright CLI to export cookies/storage as a JSON array.<br />
                    3. Paste the complete JSON object below.
                  </div>

                  <div className="p-3 bg-indigo-950/40 border border-indigo-900/50 rounded-lg space-y-1 text-[11px] leading-relaxed text-indigo-300">
                    <span className="font-bold text-white flex items-center gap-1">💡 Persistent Render Deployments:</span>
                    Render containers reset local files on each redeployment or restart. To persist your login session permanently, add an Environment Variable on Render with Key <code className="bg-indigo-950 px-1 py-0.5 rounded text-white font-mono font-bold">AUTH_STATE_JSON</code> and paste this complete JSON string as the Value!
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase text-slate-400 font-mono tracking-widest font-bold">Paste state.json content</label>
                    <textarea
                      rows={8}
                      value={sessionJson}
                      disabled={isBusy || isContinuousLoopActive}
                      onChange={(e) => setSessionJson(e.target.value)}
                      placeholder='{ "cookies": [ { "name": "session_token", "value": "..." } ] }'
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-[10px] text-emerald-400 focus:outline-none focus:border-emerald-500 placeholder-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              {loginTab === "profiles" && (
                <div className="space-y-4 text-xs text-slate-300">
                  {(isBusy || isPostingActive || isContinuousLoopActive) && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300 text-xs font-semibold">
                      <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 animate-pulse" />
                      <span>Process in progress: Posting or background automation is active. Account switching, profile additions, and deletions are locked until you click "Stop Posting".</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <p className="text-[11px] text-slate-400">
                      Save up to 5 CoinMarketCap account profiles and swap between them seamlessly.
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          handleResetLoginState();
                          setLoginTab("credentials");
                        }}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Locked while process is active" : "Log In Another Account"}
                      >
                        🔑 Log In Another Account
                      </button>
                      <button
                        onClick={() => {
                          if (!showProfileAddForm && profilesList.length >= 5) {
                            showToast("Maximum of 5 profiles allowed. Please delete one first.", "error");
                          } else {
                            setShowProfileAddForm(!showProfileAddForm);
                          }
                        }}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-medium border border-slate-700 flex items-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Locked while process is active" : "Paste JSON Profile"}
                      >
                        {showProfileAddForm ? "✕ Close Form" : "📋 Paste JSON Profile"}
                      </button>
                    </div>
                  </div>

                  {showProfileAddForm && (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3.5 opacity-[0.99]">
                      <h4 className="font-bold text-white text-[11px] uppercase tracking-wider">New Account Profile</h4>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-400 font-mono font-bold">Profile Name / Owner</label>
                        <input
                          type="text"
                          value={newProfileName}
                          disabled={isBusy || isContinuousLoopActive}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          placeholder="e.g. Anup Main Account, Vineet Bot"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-700 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-400 font-mono font-bold">Cookies JSON (state.json content)</label>
                        <textarea
                          rows={4}
                          value={newProfileJson}
                          disabled={isBusy || isContinuousLoopActive}
                          onChange={(e) => setNewProfileJson(e.target.value)}
                          placeholder='{ "cookies": [ { "name": "session_token", "value": "..." } ] }'
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-emerald-400 focus:outline-none focus:border-emerald-500 placeholder-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </div>
                      <button
                        onClick={() => handleSaveProfile(newProfileName, newProfileJson)}
                        disabled={isBusy || isContinuousLoopActive}
                        className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save Account Profile
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-400 font-mono text-[10px] uppercase tracking-wider">Saved Accounts Profiles</h4>
                    {profilesList.length === 0 ? (
                      <div className="p-6 bg-slate-950 border border-slate-800/80 rounded-xl text-center text-slate-500 text-[11px]">
                        No account profiles saved yet. Add one above to enable fast multi-account switching.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {profilesList.map((p) => (
                          <div
                            key={p.id}
                            className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                              p.isActive
                                ? "bg-emerald-500/5 border-emerald-500/25"
                                : "bg-slate-950 border-slate-800 hover:border-slate-800"
                            }`}
                          >
                            <div className="space-y-1 pr-4 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-white text-xs truncate">{p.name}</span>
                                {p.isActive && (
                                  <span className="bg-emerald-500/15 text-emerald-400 text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold">
                                    Active
                                  </span>
                                )}
                                {p.loginStatus === "logged_in" ? (
                                  <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                    Logged In
                                  </span>
                                ) : p.loginStatus === "expired" ? (
                                  <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                                    Logged Out
                                  </span>
                                ) : (
                                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                    Unverified
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 block font-mono">
                                ID: {p.id} • Saved: {new Date(p.updatedAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {!p.isActive && (
                                <button
                                  onClick={() => promptSwitchProfile(p)}
                                  disabled={isBusy || isPostingActive || isContinuousLoopActive || switchingProfileId !== null}
                                  className="py-1 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-bold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                  title={
                                    (isBusy || isPostingActive || isContinuousLoopActive)
                                      ? "Cannot switch accounts while posting or automation is active. Click 'Stop Posting' first."
                                      : `Switch to ${p.name}`
                                  }
                                >
                                  {switchingProfileId === p.id ? (
                                    <>
                                      <RefreshCw className="h-2.5 w-2.5 animate-spin text-slate-950" />
                                      <span>Switching...</span>
                                    </>
                                  ) : (isBusy || isPostingActive || isContinuousLoopActive) ? (
                                    <>
                                      <span>🔒</span>
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
                                  showToast(`Copied state.json for "${p.name}" to clipboard!`, "success");
                                }}
                                className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-medium rounded-lg border border-slate-800 cursor-pointer"
                              >
                                📋 Copy JSON
                              </button>
                              {deletingId === p.id ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      handleDeleteProfile(p.id);
                                      setDeletingId(null);
                                    }}
                                    disabled={isBusy || isPostingActive || isContinuousLoopActive}
                                    className="py-1 px-2.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded-lg cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingId(p.id)}
                                  disabled={isBusy || isPostingActive || isContinuousLoopActive}
                                  className="py-1 px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-medium rounded-lg border border-rose-500/10 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Deletion locked while process is active" : "Delete Profile"}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {activeSessionContent && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">
                          Active state.json Cookies Content
                        </label>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeSessionContent);
                            showToast("Active state.json successfully copied to clipboard!", "success");
                          }}
                          className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          📋 Copy Active Session State
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        readOnly
                        value={activeSessionContent}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-lg p-2 font-mono text-[9px] text-slate-400 focus:outline-none"
                      />
                    </div>
                  )}
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
                  className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSession}
                  className="py-2 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Save & Load Session
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* CONFIRM FETCH COINS MODAL */}
      {showConfirmFetchModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col justify-between p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-white text-base">
                  Refetch Trending Coins?
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Trending coins have already been fetched. Refetching will clear current trending data, reset generated comments, and clear posting statistics first.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmFetchModal(false)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowConfirmFetchModal(false);
                  await runCommand("/api/clear-all", "clear");
                  await runCommand("/api/fetch-trending", "fetch");
                }}
                className="py-2 px-5 bg-blue-500 hover:bg-blue-400 text-slate-950 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Yes, Reset & Fetch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM GENERATE COMMENTS MODAL */}
      {showConfirmGenerateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col justify-between p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 flex-shrink-0">
                <BookOpen className="h-6 w-6" />
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-white text-base">
                  Regenerate Comments?
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Comments have already been generated. Regenerating will overwrite existing comments and reset your current posting sequence progress.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmGenerateModal(false)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowConfirmGenerateModal(false);
                  await runCommand("/api/generate-messages", "generate");
                }}
                className="py-2 px-5 bg-purple-500 hover:bg-purple-400 text-slate-950 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Yes, Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT SWITCH CONFIRMATION POPUP MODAL */}
      {confirmSwitchProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Confirm Account Switch</h3>
                  <p className="text-xs text-slate-400">Review what happens before switching profiles</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmSwitchProfile(null)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile comparison card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
              <div className="flex-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase block font-semibold">Current Active Account</span>
                <span className="font-bold text-slate-300 truncate block">{activeProfile?.name || "Default Session"}</span>
              </div>
              <div className="flex-shrink-0 text-emerald-400 px-2 font-mono font-bold text-base">➔</div>
              <div className="flex-1 text-right">
                <span className="text-[10px] text-emerald-500 font-mono uppercase block font-semibold">Target Account</span>
                <span className="font-bold text-emerald-400 truncate block">{confirmSwitchProfile.name}</span>
              </div>
            </div>

            {/* Detailed Explanation of what happens */}
            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="font-semibold text-slate-200 text-xs">Here is what will happen when you switch:</div>
              <ul className="space-y-2 text-[11px] text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">Active Browser Identity:</strong> The active session in <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded font-mono">auth/state.json</code> will be swapped with <strong>{confirmSwitchProfile.name}</strong>'s authentication cookies. Subsequent automated posts or manual triggers will run under this identity.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">Isolated Data Sandbox:</strong> The trending coins list, AI generated comments, and posting queue will switch to <strong>{confirmSwitchProfile.name}</strong>'s isolated workspace.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">No Data Loss / No Leakage:</strong> The data of <strong>{activeProfile?.name || "Current Profile"}</strong> remains safely preserved in Firestore/cloud storage and will be restored when you switch back.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0"></span>
                  <span><strong className="text-slate-200">Continuous Loops & Tasks:</strong> Any scheduled continuous loops will proceed under the newly selected account.</span>
                </li>
              </ul>
            </div>

            {/* Active Process Barrier Warning */}
            {(isBusy || isPostingActive || isContinuousLoopActive) && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-300 text-xs font-semibold animate-pulse">
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span>Posting or background process is running! You must click "Stop Posting" before switching accounts to prevent data corruption.</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfirmSwitchProfile(null)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold hover:bg-slate-800 transition"
              >
                Cancel / Keep Current
              </button>
              <button
                onClick={async () => {
                  const targetId = confirmSwitchProfile.id;
                  setConfirmSwitchProfile(null);
                  await handleActivateProfile(targetId);
                }}
                disabled={(isBusy || isPostingActive || isContinuousLoopActive) || switchingProfileId !== null}
                className="py-2.5 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  (isBusy || isPostingActive || isContinuousLoopActive)
                    ? "Cannot switch accounts while process is active. Click 'Stop Posting' first."
                    : "Confirm account switch"
                }
              >
                {switchingProfileId === confirmSwitchProfile.id ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Switching...</span>
                  </>
                ) : (isBusy || isPostingActive || isContinuousLoopActive) ? (
                  <>
                    <span>🔒</span>
                    <span>Process Active - Stop First</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Confirm & Switch Account</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Floating Toast with Process Indicator, Turn Off toggle, and Dismiss (No persistent history) */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4.5 py-3 rounded-2xl border shadow-2xl bg-slate-900/95 border-slate-800 text-xs text-white max-w-md backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-200">
          {toast.isProcess ? (
            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 flex-shrink-0">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
            </div>
          ) : toast.type === "success" ? (
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 flex-shrink-0">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
          ) : toast.type === "error" ? (
            <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
          ) : (
            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 flex-shrink-0">
              <Info className="h-4 w-4 text-blue-400" />
            </div>
          )}

          <div className="flex-1 pr-1 leading-snug">
            <span className="font-semibold text-slate-100">{toast.message}</span>
            {toast.isProcess && (
              <span className="block text-[10px] text-blue-400 font-mono mt-0.5 animate-pulse">Running live Playwright browser in background...</span>
            )}
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <button
              onClick={toggleNotifications}
              className="text-[10px] text-slate-400 hover:text-slate-200 underline font-medium cursor-pointer"
              title="Mute toast notifications"
            >
              Turn off
            </button>
            <button
              onClick={dismissToast}
              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
