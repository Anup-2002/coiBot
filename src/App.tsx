import React, { useState, useEffect, useRef, Component, ReactNode, ErrorInfo } from "react";
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
  Archive,
  FileText,
  Download,
  Trash2,
  Lock,
  Key,
  Layers,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
  Maximize2,
  Globe,
  Upload,
  BookOpen,
  ArrowDown,
  Users,
  Camera,
  Eye,
  Shield,
  ArrowLeft,
  ArrowRight,
  HardDrive,
  Bell,
  BellOff,
  X,
  Info,
  Clock,
  ExternalLink,
  Zap,
  Sliders,
  Cpu,
  Server,
  ToggleLeft,
  ToggleRight,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  GripVertical,
  FileCode,
  Copy,
  Image as ImageIcon,
  Share2,
  LogOut,
  EyeOff,
  RotateCcw,
  Square
} from "lucide-react";
import { api, apiFetch, SchedulerStatusResponse, SchedulerAccountItem, SchedulerFileInfo, MarketingImage, HealthResponse } from "./api";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-4">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            <p className="text-sm text-slate-400">An unexpected error occurred. Click reload to refresh the application.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  createdAt?: number;
  sentiment?: "bullish" | "bearish" | "neutral";
  profileId?: string;
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
  dailyPostLimit?: number;
  proxy?: string;
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

const SafeImageDisplay: React.FC<{
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}> = ({ src, fallbackSrc, alt, className }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackAttempt, setFallbackAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
    setLoaded(false);
    setFailed(false);
    setFallbackAttempt(0);
  }, [src]);

  const handleImgError = () => {
    if (fallbackAttempt === 0 && fallbackSrc && currentSrc !== fallbackSrc) {
      setFallbackAttempt(1);
      setCurrentSrc(fallbackSrc);
    } else if (fallbackAttempt === 1) {
      setFallbackAttempt(2);
      setCurrentSrc(`/uploads/marketing_images/${encodeURIComponent(alt)}`);
    } else {
      setFailed(true);
    }
  };

  const retryLoad = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFailed(false);
    setLoaded(false);
    setFallbackAttempt(0);
    const sep = src.includes("?") ? "&" : "?";
    setCurrentSrc(`${src}${sep}retry=${Date.now()}`);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-900 overflow-hidden">
      {!loaded && !failed && (
        <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-1.5 p-2 z-10 pointer-events-none">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <span className="text-[9px] font-mono text-slate-400">Loading...</span>
        </div>
      )}
      {!failed ? (
        <img
          src={currentSrc}
          alt={alt}
          loading="lazy"
          className={`${className || "w-full h-full object-cover"} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={handleImgError}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-2 text-center text-slate-500 w-full h-full bg-slate-950">
          <ImageIcon className="h-5 w-5 text-slate-600 mb-1" />
          <span className="text-[9px] font-mono text-slate-400 truncate max-w-full px-1">{alt}</span>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-1 text-[9px] font-mono text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
          >
            Retry load
          </button>
        </div>
      )}
    </div>
  );
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
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  // Compare symbols and prices of all coins to detect any ranking, price, or coin membership changes
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (p.symbol !== n.symbol || p.price !== n.price || p.change_24h !== n.change_24h || p.cmc_rank !== n.cmc_rank) {
      return false;
    }
  }
  return true;
}

function areMessagesEqual(prev: GeneratedMessage[], next: GeneratedMessage[]): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  // Compare symbol, message body and sentiment of all messages so new generated comments immediately render
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (p.symbol !== n.symbol || p.message !== n.message || p.sentiment !== n.sentiment) {
      return false;
    }
  }
  return true;
}

function areResultsEqual(prev: PostResult[], next: PostResult[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  const p0 = prev[0];
  const n0 = next[0];
  const pLast = prev[prev.length - 1];
  const nLast = next[next.length - 1];
  return p0?.symbol === n0?.symbol && p0?.status === n0?.status && pLast?.symbol === nLast?.symbol && pLast?.status === nLast?.status && pLast?.timestamp === nLast?.timestamp;
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
function formatTimeAgo(timestamp: number | null | undefined): { text: string; full: string; isStale: boolean; isVeryStale: boolean; isExpired2Days: boolean; hasTimestamp: boolean } {
  if (!timestamp) {
    return { text: "Previous session", full: "Exact time not recorded in this session", isStale: true, isVeryStale: false, isExpired2Days: false, hasTimestamp: false };
  }
  const time = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(time) || time <= 0) {
    return { text: "Previous session", full: "N/A", isStale: true, isVeryStale: false, isExpired2Days: false, hasTimestamp: false };
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  const full = new Date(time).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const isExpired2Days = diffSec >= (48 * 3600);
  if (diffSec < 60) {
    return { text: "Just now (<1m ago)", full, isStale: false, isVeryStale: false, isExpired2Days: false, hasTimestamp: true };
  }
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) {
    return { text: `${mins}m ago`, full, isStale: mins >= 30, isVeryStale: mins >= 60, isExpired2Days: false, hasTimestamp: true };
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return { text: `${hours}h ${remMins}m ago`, full, isStale: true, isVeryStale: hours >= 3, isExpired2Days: false, hasTimestamp: true };
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return { text: `${days}d ${remHours}h ago`, full, isStale: true, isVeryStale: true, isExpired2Days, hasTimestamp: true };
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
      <span className="font-mono text-sm text-slate-300">
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
  const [storageInfo, setStorageInfo] = useState<{
    activeStore?: string;
    isMongoConnected?: boolean;
    isFirebaseDisabled?: boolean;
    isMongoPrimary?: boolean;
  }>({});
  const [isContinuousLoopActive, setIsContinuousLoopActive] = useState<boolean>(false);
  const [nextCycleStartTime, setNextCycleStartTime] = useState<number | null>(null);
  const [continuousInterval, setContinuousInterval] = useState<number>(20);
  const isInitialIntervalLoaded = useRef<boolean>(false);
  const [activeProcess, setActiveProcess] = useState<string>("none");
  const [activeProcessDescription, setActiveProcessDescription] = useState<string>("");
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [logsTab, setLogsTab] = useState<"system" | "scheduler">("system");

  // Marketing Image Upload Feature State (Strictly 1 Image Per Comment)
  const [imageUploadEnabled, setImageUploadEnabled] = useState<boolean>(false);
  const [imageSelectionMode, setImageSelectionMode] = useState<"cycle" | "random">("cycle");
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [marketingImages, setMarketingImages] = useState<MarketingImage[]>([]);
  const [isUpdatingImageSettings, setIsUpdatingImageSettings] = useState<boolean>(false);
  const [isUploadingImages, setIsUploadingImages] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>("");
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [imageSearchQuery, setImageSearchQuery] = useState<string>("");
  const [imageViewMode, setImageViewMode] = useState<"grid" | "list">("grid");
  const [imagePage, setImagePage] = useState<number>(1);
  const [imagePageSize, setImagePageSize] = useState<number>(24);
  const [previewModalImage, setPreviewModalImage] = useState<MarketingImage | null>(null);
  const [selectedImageFilenames, setSelectedImageFilenames] = useState<string[]>([]);
  const [replaceExistingOnUpload, setReplaceExistingOnUpload] = useState<boolean>(false);
  const [autoPruneEnabled, setAutoPruneEnabled] = useState<boolean>(false);
  const [autoPruneLimit, setAutoPruneLimit] = useState<number>(30);
  const [isPruningImages, setIsPruningImages] = useState<boolean>(false);
  const [isExternalImportModalOpen, setIsExternalImportModalOpen] = useState<boolean>(false);
  const [externalImportLinks, setExternalImportLinks] = useState<string>("");
  const [externalImportReplace, setExternalImportReplace] = useState<boolean>(false);
  const [isImportingExternal, setIsImportingExternal] = useState<boolean>(false);
  const [externalImportStatus, setExternalImportStatus] = useState<string | null>(null);

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
  const [showStaleWarningModal, setShowStaleWarningModal] = useState<boolean>(false);
  const [isDataStale, setIsDataStale] = useState<boolean>(false);
  const [isRefreshingFreshData, setIsRefreshingFreshData] = useState<boolean>(false);

  // Account Profiles support
  const [profilesList, setProfilesList] = useState<any[]>([]);
  const [newProfileName, setNewProfileName] = useState<string>("");
  const [newProfileJson, setNewProfileJson] = useState<string>("");
  const [newProfileLimit, setNewProfileLimit] = useState<number>(300);
  const [newProfileProxy, setNewProfileProxy] = useState<string>("");
  const [editingLimitProfileId, setEditingLimitProfileId] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState<number>(300);
  const [editingProxyProfileId, setEditingProxyProfileId] = useState<string | null>(null);
  const [editingProxyValue, setEditingProxyValue] = useState<string>("");
  const [dailyPostCount, setDailyPostCount] = useState<number>(0);
  const [dailyPostLimit, setDailyPostLimit] = useState<number>(300);
  const [lastPostDate, setLastPostDate] = useState<string>("");
  const [activeProfile, setActiveProfile] = useState<any | null>(null);
  const activeProfileIdRef = useRef<string | null>(null);
  const [showProfileAddForm, setShowProfileAddForm] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Routing state between Main Dashboard, Multi-Account Scheduler, and Admin Screen
  // Routing state between Main Dashboard, Multi-Account Scheduler, Admin Screen, Guide, Logs, and Health
  const [currentView, setCurrentView] = useState<"dashboard" | "scheduler" | "admin" | "guide" | "logs" | "health">(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname.toLowerCase();
      const h = window.location.hash.toLowerCase();
      if (p.startsWith("/scheduler") || h.startsWith("#/scheduler") || h === "#scheduler") {
        return "scheduler";
      }
      if (p.startsWith("/admin") || h.startsWith("#/admin")) {
        return "admin";
      }
      if (p.startsWith("/guide") || h.startsWith("#/guide")) {
        return "guide";
      }
      if (p.startsWith("/logs") || h.startsWith("#/logs")) {
        return "logs";
      }
      if (p.startsWith("/health") || h.startsWith("#/health")) {
        return "health";
      }
    }
    return "dashboard";
  });

  const [adminSection, setAdminSection] = useState<"diagnostics" | "secrets" | "telegram" | "security">("diagnostics");
  const [guideStep, setGuideStep] = useState<"all" | "getting-started" | "accounts" | "scheduler" | "images" | "troubleshooting">("all");

  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(true);
  const [telegramToken, setTelegramToken] = useState<string>("");
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [isDetectingTelegram, setIsDetectingTelegram] = useState<boolean>(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);

  useEffect(() => {
    const fetchTelegramSettings = async () => {
      try {
        const res = await apiFetch("/api/telegram/settings");
        if (res.ok) {
          const data = await res.json();
          setTelegramEnabled(data.enabled !== false);
          if (data.botToken) setTelegramToken(data.botToken);
          if (data.chatId) setTelegramChatId(data.chatId);
        }
      } catch (_) {}
    };
    fetchTelegramSettings();
  }, []);

  useEffect(() => {
    const handleNav = () => {
      const p = window.location.pathname.toLowerCase();
      const h = window.location.hash.toLowerCase();
      if (p.startsWith("/scheduler") || h.startsWith("#/scheduler") || h === "#scheduler") {
        setCurrentView("scheduler");
      } else if (p.startsWith("/admin") || h.startsWith("#/admin")) {
        setCurrentView("admin");
      } else if (p.startsWith("/guide") || h.startsWith("#/guide")) {
        setCurrentView("guide");
      } else if (p.startsWith("/logs") || h.startsWith("#/logs")) {
        setCurrentView("logs");
      } else if (p.startsWith("/health") || h.startsWith("#/health")) {
        setCurrentView("health");
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

  const navigateTo = (view: "dashboard" | "scheduler" | "admin" | "guide" | "logs" | "health", section?: "diagnostics" | "secrets" | "telegram" | "security") => {
    setCurrentView(view);
    if (section) setAdminSection(section);
    let path = "/";
    if (view === "scheduler") path = "/scheduler";
    else if (view === "admin") path = "/admin";
    else if (view === "guide") path = "/guide";
    else if (view === "logs") path = "/logs";
    else if (view === "health") path = "/health";
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    try {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } catch (_) {}
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
    type: "success" | "error" | "info" | "process" | "warning";
    isProcess?: boolean;
  } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const [inlineConfirmModal, setInlineConfirmModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" | "process" | "warning" = "info", durationMs: number = 4000) => {
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

  const handleToggleTelegram = async (enabled: boolean) => {
    try {
      setTelegramEnabled(enabled);
      const res = await apiFetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, botToken: telegramToken, chatId: telegramChatId })
      });
      if (res.ok) {
        showToast(enabled ? "Emergency Telegram alerts enabled." : "Emergency Telegram alerts paused.", "success");
      }
    } catch (_) {
      showToast("Failed to update Telegram settings.", "error");
    }
  };

  const handleTestEmergencyAlert = async () => {
    setIsTestingTelegram(true);
    try {
      const res = await apiFetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: telegramToken, chatId: telegramChatId })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Emergency test alert delivered to @anup_cms_alert_bot!", "success");
      } else {
        showToast(`Telegram error: ${data.error || "Failed to send"}`, "error");
      }
    } catch (_) {
      showToast("Network failure sending test alert.", "error");
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleDetectTelegramChatId = async () => {
    setIsDetectingTelegram(true);
    try {
      const res = await apiFetch(`/api/telegram/detect-chat-id?token=${encodeURIComponent(telegramToken)}`);
      const data = await res.json();
      if (data.success && data.chatId) {
        setTelegramChatId(data.chatId);
        showToast(`Chat ID detected: ${data.chatId} (${data.senderName || "User"})`, "success");
      } else {
        showToast(data.message || data.error || "No messages found. Press /start on bot first.", "warning");
      }
    } catch (_) {
      showToast("Failed to detect chat ID.", "error");
    } finally {
      setIsDetectingTelegram(false);
    }
  };

  const [targetCoinsCount, setTargetCoinsCount] = useState<number>(0);
  const [isVerifyingFleet, setIsVerifyingFleet] = useState<boolean>(false);
  const [fleetHealthSummary, setFleetHealthSummary] = useState<{ healthy: number; expired: number; checkedAt?: string } | null>(null);
  const [isResettingDailyQueue, setIsResettingDailyQueue] = useState<boolean>(false);
  const [showResetQueueConfirm, setShowResetQueueConfirm] = useState<boolean>(false);

  const handleUpdateTargetCoins = async (count: number) => {
    try {
      setTargetCoinsCount(count);
      const res = await api.updateTargetCoins(count);
      if (res.success) {
        showToast(`Target coin limit set to ${count === 0 ? "All Available Coins" : `Top ${count} Coins`}.`, "success");
      }
    } catch (_) {
      showToast("Failed to update coin target limit.", "error");
    }
  };

  const handleResetDailyQueue = async (resetDailyCap: boolean = false) => {
    setIsResettingDailyQueue(true);
    try {
      const res = await api.resetDailyQueue({ resetDailyCap });
      if (res.success) {
        setResults([]);
        setProgressIndex(0);
        if (resetDailyCap) {
          setDailyPostCount(0);
        }
        setShowResetQueueConfirm(false);
        showToast("Queue safely restarted at Coin #1. Previous posts archived in 7-day retention database.", "success");
        await fetchStats();
        await fetchResults();
      } else {
        showToast(res.error || "Failed to reset queue", "error");
      }
    } catch (_) {
      showToast("Error resetting daily queue.", "error");
    } finally {
      setIsResettingDailyQueue(false);
    }
  };

  const [isPruningData, setIsPruningData] = useState<boolean>(false);
  const [retentionDays, setRetentionDays] = useState<number>(7);
  const [showRetentionSettingsModal, setShowRetentionSettingsModal] = useState<boolean>(false);
  const [retentionStats, setRetentionStats] = useState<{ activeCount: number; archivedCount: number } | null>(null);

  const handlePruneOldData = async (days?: number) => {
    setIsPruningData(true);
    try {
      const res = await api.pruneOldData({ retentionDays: days || retentionDays });
      if (res.success) {
        showToast(res.details || `Pruned ${res.prunedCount} old submissions.`, "success");
        await fetchStats();
        await fetchResults();
      } else {
        showToast(res.error || "Failed to prune old data.", "error");
      }
    } catch (_) {
      showToast("Error executing data pruning.", "error");
    } finally {
      setIsPruningData(false);
    }
  };

  const handleSaveRetentionSettings = async (days: number, autoBatchPrune: boolean) => {
    try {
      setRetentionDays(days);
      const res = await api.updateDataRetentionSettings({
        autoPruneOldDataEnabled: true,
        dataRetentionDays: days,
        autoPruneCompletedBatches: autoBatchPrune,
      });
      if (res.success) {
        showToast(`Retention policy updated to ${days} days. Auto-compaction active.`, "success");
        setShowRetentionSettingsModal(false);
        await fetchStats();
        await fetchResults();
      } else {
        showToast(res.error || "Failed to update retention policy.", "error");
      }
    } catch (_) {
      showToast("Error updating retention settings.", "error");
    }
  };

  const handleVerifyAllFleetSessions = async () => {
    setIsVerifyingFleet(true);
    try {
      const res = await api.verifyAllFleetSessions();
      if (res.success) {
        setFleetHealthSummary({
          healthy: res.healthyCount,
          expired: res.expiredCount,
          checkedAt: res.checkedAt,
        });
        await fetchProfiles();
        await fetchSchedulerStatus();
        showToast(
          `Fleet check: ${res.healthyCount}/${res.totalAccounts} accounts healthy and authenticated.`,
          res.expiredCount > 0 ? "warning" : "success"
        );
      } else {
        showToast(res.error || "Fleet verification failed.", "error");
      }
    } catch (_) {
      showToast("Network error checking account fleet sessions.", "error");
    } finally {
      setIsVerifyingFleet(false);
    }
  };

  // ==========================================
  // Company Admin Access & Login Gate State
  // ==========================================
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("cmc_admin_auth_token");
      if (stored) return true;
    } catch (_) {}
    return false;
  });
  const [adminAuthRequired, setAdminAuthRequired] = useState<boolean>(true);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");
  const [showAdminPassword, setShowAdminPassword] = useState<boolean>(false);
  const [adminAuthLoading, setAdminAuthLoading] = useState<boolean>(false);
  const [adminLoginError, setAdminLoginError] = useState<string>("");
  const [rememberAdminLogin, setRememberAdminLogin] = useState<boolean>(true);
  const [currentAdminPassword, setCurrentAdminPassword] = useState<string>("");
  const [showRevealedAdminPassword, setShowRevealedAdminPassword] = useState<boolean>(false);
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState<string>("");
  const [isChangingAdminPassword, setIsChangingAdminPassword] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [adminSchedulerStatus, setAdminSchedulerStatus] = useState<{
    enabled?: boolean;
    cycleRunning?: boolean;
    postingRunning?: boolean;
    botStatus?: string;
    nextCycleAt?: string | null;
    isContinuousLoopActive?: boolean;
  } | null>(null);
  // Check 1-click access token in URL / hash and verify auth status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const urlKey = params.get("key") || params.get("pass") || params.get("token") || params.get("access_token");
    let hashKey = "";
    if (hash && hash.includes("key=")) {
      const match = hash.match(/key=([^&]+)/);
      if (match) hashKey = decodeURIComponent(match[1]);
    }
    const keyToTest = urlKey || hashKey;

    const checkAuth = async () => {
      try {
        const storedToken = localStorage.getItem("cmc_admin_auth_token") || "";
        const statusRes = await api.getAdminAuthStatus(storedToken || keyToTest || undefined);
        
        if (statusRes.scheduler) {
          setAdminSchedulerStatus(statusRes.scheduler);
        }

        if (statusRes.authRequired === false) {
          setIsAdminAuthenticated(true);
          setAdminAuthRequired(false);
          return;
        }

        if (statusRes.currentPassword) {
          setCurrentAdminPassword(statusRes.currentPassword);
        }

        if (statusRes.authenticated) {
          setIsAdminAuthenticated(true);
          return;
        }

        // Auto-login if URL key was supplied
        if (keyToTest) {
          setAdminAuthLoading(true);
          const loginRes = await api.adminLogin(keyToTest);
          if (loginRes.success && loginRes.token) {
            localStorage.setItem("cmc_admin_auth_token", loginRes.token);
            setIsAdminAuthenticated(true);
            showToast("Authenticated via Company Admin 1-Click Link!", "success");
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
          setAdminAuthLoading(false);
        }
      } catch (err) {
        console.warn("Admin auth verification error:", err);
      }
    };

    checkAuth();
  }, []);

  // Poll scheduler state on the admin login screen so live background activity is visible
  useEffect(() => {
    if (!adminAuthRequired || isAdminAuthenticated) return;
    const pollLoginScheduler = async () => {
      try {
        const st = await api.getAdminAuthStatus();
        if (st.scheduler) setAdminSchedulerStatus(st.scheduler);
      } catch (_) {}
    };
    pollLoginScheduler();
    const interval = setInterval(pollLoginScheduler, 3000);
    return () => clearInterval(interval);
  }, [adminAuthRequired, isAdminAuthenticated]);


  const handleAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminPasswordInput.trim()) {
      setAdminLoginError("Please enter the company admin password.");
      return;
    }
    setAdminAuthLoading(true);
    setAdminLoginError("");
    try {
      const res = await api.adminLogin(adminPasswordInput.trim());
      if (res.success && res.token) {
        if (rememberAdminLogin) {
          localStorage.setItem("cmc_admin_auth_token", res.token);
        }
        setIsAdminAuthenticated(true);
        setAdminLoginError("");
        showToast("Company Admin access granted!", "success");
        api.getAdminAuthStatus(res.token).then(st => {
          if (st.currentPassword) setCurrentAdminPassword(st.currentPassword);
          if (st.scheduler) setAdminSchedulerStatus(st.scheduler);
        });
      } else {
        setAdminLoginError(res.error || "Incorrect password. Please verify and try again.");
      }
    } catch (_) {
      setAdminLoginError("Connection error. Could not verify admin credentials.");
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handleAdminLogout = () => {
    try {
      localStorage.removeItem("cmc_admin_auth_token");
    } catch (_) {}
    setIsAdminAuthenticated(false);
    setAdminPasswordInput("");
    showToast("Logged out of Company Admin.", "info");
    api.getAdminAuthStatus().then(st => {
      if (st.scheduler) setAdminSchedulerStatus(st.scheduler);
    }).catch(() => {});
  };

  const handleCopyShareLink = () => {
    const origin = window.location.origin;
    const shareUrl = `${origin}/?key=${encodeURIComponent(currentAdminPassword)}`;
    navigator.clipboard.writeText(shareUrl);
    showToast("1-Click Team Access Link copied to clipboard!", "success");
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(currentAdminPassword);
    showToast("Admin password copied to clipboard!", "success");
  };

  const handleUpdatePassword = async () => {
    if (!newAdminPasswordInput.trim() || newAdminPasswordInput.trim().length < 3) {
      showToast("Password must be at least 3 characters.", "error");
      return;
    }
    try {
      const token = localStorage.getItem("cmc_admin_auth_token") || currentAdminPassword;
      const res = await api.updateAdminPassword(newAdminPasswordInput.trim(), token);
      if (res.success) {
        if (res.token) {
          localStorage.setItem("cmc_admin_auth_token", res.token);
        }
        setCurrentAdminPassword(newAdminPasswordInput.trim());
        setNewAdminPasswordInput("");
        setIsChangingAdminPassword(false);
        showToast("Company admin password updated successfully!", "success");
      } else {
        showToast(res.error || "Failed to update password.", "error");
      }
    } catch (_) {
      showToast("Error updating password.", "error");
    }
  };

  const handleToggleAdminAuth = async (enabled: boolean) => {
    try {
      const token = localStorage.getItem("cmc_admin_auth_token") || currentAdminPassword;
      const res = await api.toggleAdminAuth(enabled, token);
      if (res.success) {
        setAdminAuthRequired(res.authRequired !== false);
        showToast(
          res.authRequired !== false ? "Password protection enabled." : "Password requirement disabled.",
          "info"
        );
      }
    } catch (_) {
      showToast("Failed to toggle admin security setting.", "error");
    }
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
  const [schedulerLogsList, setSchedulerLogsList] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");

  // Data Explorer Tabs & Search Filters
  const [activeTab, setActiveTab] = useState<string>("coins");
  const [submissionsViewMode, setSubmissionsViewMode] = useState<"current_batch" | "all_history">("current_batch");
  const [coinsList, setCoinsList] = useState<Coin[]>([]);
  const [messagesList, setMessagesList] = useState<GeneratedMessage[]>([]);
  const [coinSearchQuery, setCoinSearchQuery] = useState<string>("");
  const [commentSearchQuery, setCommentSearchQuery] = useState<string>("");

  // System Check State
  const [systemCheckResult, setSystemCheckResult] = useState<{ success?: boolean;
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
      await fetchLogs();
      await fetchCoins();
      await fetchMessages();
      await fetchResults();

      showToast("Data storage refreshed successfully!", "success");
    } catch (err) {
      showToast("Failed to refresh data: " + (err as Error).message, "error");
    } finally {
      setIsRefreshingData(false);
    }
  };


  // Sequential Multi-Account Scheduler State (Part 3)
  const [schedulerData, setSchedulerData] = useState<SchedulerStatusResponse | null>(null);
  const [isSchedulerActionPending, setIsSchedulerActionPending] = useState<boolean>(false);
  const [schedulerIntervalInput, setSchedulerIntervalInput] = useState<number>(20);
  const [draggedAccountIndex, setDraggedAccountIndex] = useState<number | null>(null);
  const [schedulerLogQuery, setSchedulerLogQuery] = useState<string>("");

  const fetchSchedulerStatus = async () => {
    try {
      const data = await api.getScheduler();
      setSchedulerData(data);
      if (data.intervalMinutes) {
        setSchedulerIntervalInput(data.intervalMinutes);
      }
      if (typeof data.targetCoinsCount === "number") {
        setTargetCoinsCount(data.targetCoinsCount);
      }
    } catch (err) {
      console.error("Error fetching scheduler:", err);
    }
  };

  // Poll GET /api/scheduler frequently when on /scheduler page
  useEffect(() => {
    if (currentView !== "scheduler") return;
    let isMounted = true;
    const poll = async () => {
      try {
        const data = await api.getScheduler();
        if (isMounted && data) {
          setSchedulerData(data);
          if (data.intervalMinutes) setSchedulerIntervalInput(data.intervalMinutes);
          if (typeof data.targetCoinsCount === "number") setTargetCoinsCount(data.targetCoinsCount);
        }
      } catch (_) {}
    };

    poll();

    const interval = setInterval(poll, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentView]);

  const handleToggleScheduler = async (explicitVal?: boolean | unknown) => {
    if (isSchedulerRunning) {
      showToast("Scheduler cycle is currently running. Use Pause or Stop in Cycle Execution Controls first.", "warning");
      return;
    }
    setIsSchedulerActionPending(true);
    const prevVal = Boolean(schedulerData?.enabled);
    const nextVal = typeof explicitVal === "boolean" ? explicitVal : !prevVal;
    
    if (nextVal && schedulerData && Array.isArray(schedulerData.accounts) && schedulerData.accounts.length > 0) {
      const hasAuth = schedulerData.accounts.some(a => a.hasValidSession);
      if (!hasAuth) {
        showToast("Cannot enable 24-hr scheduler: None of your accounts have valid session cookies. Please log in or import cookies in Profiles first.", "error", 6000);
        setIsSchedulerActionPending(false);
        return;
      }
    }

    // Optimistic UI update for zero-lag transition
    setSchedulerData(prev => prev ? { ...prev, enabled: nextVal } : null);

    try {
      const res = await api.setSchedulerSettings({ enabled: nextVal });
      if (res.success) {
        showToast(`Sequential scheduler set to: ${nextVal ? "ENABLED" : "DISABLED"}`, "success");
        await fetchSchedulerStatus();
      } else {
        setSchedulerData(prev => prev ? { ...prev, enabled: prevVal } : null);
        showToast(res.error || "Failed to update scheduler", "error");
      }
    } catch (err) {
      setSchedulerData(prev => prev ? { ...prev, enabled: prevVal } : null);
      showToast("Error updating scheduler: " + (err as Error).message, "error");
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const handleSaveInterval = async (mins: number) => {
    setIsSchedulerActionPending(true);
    try {
      const res = await api.setSchedulerSettings({ intervalMinutes: mins });
      if (res.success) {
        showToast(`Gap cooldown interval updated to ${mins} minutes!`, "success");
        await fetchSchedulerStatus();
      } else {
        showToast(res.error || "Failed to save interval", "error");
      }
    } catch (err) {
      showToast("Error updating interval: " + (err as Error).message, "error");
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const handleUpdateSchedulerInterval = handleSaveInterval;

  const handleRunSchedulerNow = async () => {
    setIsSchedulerActionPending(true);
    if (schedulerData && Array.isArray(schedulerData.accounts) && schedulerData.accounts.length > 0) {
      const hasAuth = schedulerData.accounts.some(a => a.hasValidSession);
      if (!hasAuth) {
        showToast("Cannot run cycle: None of your accounts have valid session cookies. Please log in first.", "error", 6000);
        setIsSchedulerActionPending(false);
        return;
      }
    }
    try {
      // Auto-enable sequential mode if not already enabled so 1-click "Run cycle now" always works seamlessly
      if (!schedulerData?.enabled) {
        setSchedulerData(prev => prev ? { ...prev, enabled: true } : null);
        await api.setSchedulerSettings({ enabled: true });
      }
      setSchedulerData(prev => prev ? { ...prev, enabled: true, cycleRunning: true, status: "running" } : null);
      const res = await api.runSchedulerNow();
      if (res.success) {
        showToast("Sequential scheduled cycle started successfully!", "success");
        await fetchSchedulerStatus();
      } else {
        showToast(res.error || "Could not run scheduled cycle", "error");
        await fetchSchedulerStatus();
      }
    } catch (err) {
      showToast("Error starting cycle: " + (err as Error).message, "error");
      await fetchSchedulerStatus();
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const handleStopScheduler = async () => {
    setIsSchedulerActionPending(true);
    try {
      await api.stopScheduler().catch(() => {});
      await api.stopPosting().catch(() => {});
      setSchedulerData(prev => prev ? { ...prev, enabled: false, cycleRunning: false, status: "stopped" } : null);
      showToast("Scheduler stopped; letting current coin finish gracefully.", "info");
      await fetchSchedulerStatus();
    } catch (err) {
      showToast("Error stopping scheduler: " + (err as Error).message, "error");
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const handlePauseScheduler = async () => {
    setIsSchedulerActionPending(true);
    try {
      const res = await api.pauseScheduler();
      if (res.success) {
        showToast(res.message || "Scheduler paused; current coin will finish before pausing.", "info");
      }
      await fetchSchedulerStatus();
    } catch (err) {
      showToast("Error pausing scheduler: " + (err as Error).message, "error");
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const handleResumeScheduler = async () => {
    setIsSchedulerActionPending(true);
    try {
      const res = await api.resumeScheduler();
      if (res.success) {
        showToast(res.message || "Scheduler resumed from saved position.", "success");
      }
      await fetchSchedulerStatus();
    } catch (err) {
      showToast("Error resuming scheduler: " + (err as Error).message, "error");
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const fetchMarketingImages = async () => {
    try {
      const data = await api.getMarketingImages();
      if (data.success) {
        setMarketingImages(data.images || []);
        setImageUploadEnabled(Boolean(data.imageUploadEnabled));
        if (data.imageSelectionMode) setImageSelectionMode(data.imageSelectionMode);
        if (data.activeImageIndex !== undefined) setActiveImageIndex(data.activeImageIndex);
        if ((data as any).autoPruneEnabled !== undefined) setAutoPruneEnabled(Boolean((data as any).autoPruneEnabled));
        if ((data as any).autoPruneLimit !== undefined) setAutoPruneLimit(Number((data as any).autoPruneLimit));
      }
    } catch (err) {
      console.warn("Error fetching marketing images:", err);
    }
  };

  const handleToggleImageUpload = async (nextVal?: boolean) => {
    setIsUpdatingImageSettings(true);
    const targetState = nextVal !== undefined ? nextVal : !imageUploadEnabled;
    try {
      const res = await api.setImageSettings({ enabled: targetState });
      if (res.success) {
        setImageUploadEnabled(res.imageUploadEnabled);
        showToast(
          res.imageUploadEnabled
            ? "Marketing image attachments enabled! 1 branded image will be added per comment."
            : "Image attachments disabled. Bot will post comments as text-only.",
          "success"
        );
      } else {
        showToast(res.error || "Failed to update image upload setting", "error");
      }
    } catch (err) {
      showToast("Error updating image upload: " + (err as Error).message, "error");
    } finally {
      setIsUpdatingImageSettings(false);
    }
  };

  const handleSetImageMode = async (mode: "cycle" | "random") => {
    setIsUpdatingImageSettings(true);
    try {
      const res = await api.setImageSettings({ mode });
      if (res.success) {
        setImageSelectionMode(res.imageSelectionMode);
        showToast(`Image rotation mode set to: ${mode === "cycle" ? "Sequential Cycle" : "Random Selection"}`, "info");
      }
    } catch (err) {
      showToast("Error updating image mode: " + (err as Error).message, "error");
    } finally {
      setIsUpdatingImageSettings(false);
    }
  };

  const handleToggleAutoPrune = async (enabledVal?: boolean, limitVal?: number) => {
    setIsUpdatingImageSettings(true);
    const targetEnabled = enabledVal !== undefined ? enabledVal : !autoPruneEnabled;
    const targetLimit = limitVal !== undefined ? limitVal : autoPruneLimit;
    try {
      const res = await api.setImageSettings({
        autoPruneEnabled: targetEnabled,
        autoPruneLimit: targetLimit,
      });
      if (res.success) {
        setAutoPruneEnabled(Boolean(res.autoPruneEnabled));
        if (res.autoPruneLimit) setAutoPruneLimit(res.autoPruneLimit);
        showToast(
          targetEnabled
            ? `Auto-Prune enabled: Server automatically retains latest ${targetLimit} graphics.`
            : "Auto-Prune disabled. Image history will be kept until manually deleted.",
          "info"
        );
      }
    } catch (err) {
      showToast("Error updating auto-prune settings: " + (err as Error).message, "error");
    } finally {
      setIsUpdatingImageSettings(false);
    }
  };

  const handleManualPruneNow = async (count: number) => {
    setInlineConfirmModal({
      isOpen: true,
      title: "Prune Marketing Images",
      message: `Prune older images and retain only the ${count} newest graphics in your pool?`,
      onConfirm: async () => {
        setIsPruningImages(true);
        try {
          const res = await api.autoPruneMarketingImages(count);
          if (res.success) {
            showToast(res.message || `Pruned ${res.prunedCount} images. Retained ${res.remainingCount} newest.`, "success");
            setSelectedImageFilenames([]);
            await fetchMarketingImages();
          } else {
            showToast(res.error || "Failed to prune images", "error");
          }
        } catch (err) {
          showToast("Error pruning images: " + (err as Error).message, "error");
        } finally {
          setIsPruningImages(false);
        }
      }
    });
  };

  const handleDeleteMarketingImage = async (filename: string) => {
    try {
      const res = await api.deleteMarketingImage(filename);
      if (res.success) {
        showToast(`Deleted ${filename}`, "info");
        await fetchMarketingImages();
      } else {
        showToast(res.error || "Failed to delete image", "error");
      }
    } catch (err) {
      showToast("Error deleting image: " + (err as Error).message, "error");
    }
  };

  const handleImportExternalImages = async () => {
    if (!externalImportLinks.trim()) {
      showToast("Please enter at least one Google Drive link, S3 URL, or image link.", "warning");
      return;
    }
    setIsImportingExternal(true);
    setExternalImportStatus("Connecting to external source & downloading images...");
    try {
      const res = await api.importExternalImages({
        links: externalImportLinks.trim(),
        replaceExisting: externalImportReplace,
      });
      if (res.success) {
        showToast(res.message || `Imported ${res.importedCount} image(s) successfully!`, "success", 4000);
        setExternalImportStatus(`Success! Imported ${res.importedCount} image(s).` + (res.errors ? ` (${res.errors.length} skipped)` : ""));
        await fetchMarketingImages();
        setTimeout(() => {
          setIsExternalImportModalOpen(false);
          setExternalImportStatus(null);
          setExternalImportLinks("");
        }, 1200);
      } else {
        showToast(res.error || "Failed to import external images", "error");
        setExternalImportStatus(`Error: ${res.error || "Failed to import"}`);
      }
    } catch (err) {
      showToast("Import error: " + (err as Error).message, "error");
      setExternalImportStatus(`Error: ${(err as Error).message}`);
    } finally {
      setIsImportingExternal(false);
    }
  };

  const optimizeImageFile = async (file: File): Promise<string> => {
    // If it's a GIF, return raw base64 to preserve animation frames
    if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        // Rescale proportionally to optimal 1600px max dimension for fast upload & crisp display
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-quality WebP or JPEG (quality 0.86) to reduce file size from 2.5MB to ~180-250KB
        // This ensures super fast upload to CoinMarketCap with zero blur on candlestick charts or text
        let dataUrl = canvas.toDataURL("image/webp", 0.86);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        }
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  };

  const handleUploadMarketingImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImages(true);
    setUploadProgressText(`Preparing ${files.length} image(s)...`);
    try {
      const payload: Array<{ filename: string; base64: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText(`Optimizing image ${i + 1} of ${files.length}...`);
        const base64 = await optimizeImageFile(file);
        payload.push({ filename: file.name, base64 });
      }

      setUploadProgressText("Saving to server pool...");
      const res = await api.uploadMarketingImages(payload, replaceExistingOnUpload, autoPruneEnabled ? autoPruneLimit : undefined);
      if (res.success) {
        showToast(
          `Successfully uploaded ${res.uploadedCount || payload.length} image(s)!` +
            (replaceExistingOnUpload ? " (Previous batch replaced)" : ""),
          "success"
        );
        setSelectedImageFilenames([]);
        await fetchMarketingImages();
      } else {
        showToast(res.error || "Failed to upload images", "error");
      }
    } catch (err) {
      showToast("Error uploading images: " + (err as Error).message, "error");
    } finally {
      setIsUploadingImages(false);
      setUploadProgressText("");
      if (e.target) e.target.value = "";
    }
  };

  const handleSelectAllImages = () => {
    if (selectedImageFilenames.length === marketingImages.length) {
      setSelectedImageFilenames([]);
    } else {
      setSelectedImageFilenames(marketingImages.map((m) => m.filename));
    }
  };

  const handleBatchDeleteSelectedImages = async () => {
    if (selectedImageFilenames.length === 0) return;
    setInlineConfirmModal({
      isOpen: true,
      title: "Delete Selected Images",
      message: `Are you sure you want to delete ${selectedImageFilenames.length} selected image(s)?`,
      onConfirm: async () => {
        try {
          const res = await api.batchDeleteMarketingImages(selectedImageFilenames);
          if (res.success) {
            showToast(`Successfully deleted ${res.deletedCount || selectedImageFilenames.length} image(s)`, "info");
            setSelectedImageFilenames([]);
            await fetchMarketingImages();
          } else {
            showToast(res.error || "Failed to delete selected images", "error");
          }
        } catch (err) {
          showToast("Error deleting selected images: " + (err as Error).message, "error");
        }
      }
    });
  };

  const handleToggleSelectImage = (filename: string) => {
    setSelectedImageFilenames((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename]
    );
  };

  const handleClearAllMarketingImages = async () => {
    setInlineConfirmModal({
      isOpen: true,
      title: "Remove All Images",
      message: "Are you sure you want to remove all marketing images from the server?",
      onConfirm: async () => {
        try {
          const res = await api.clearAllMarketingImages();
          if (res.success) {
            showToast("All marketing images removed", "info");
            setSelectedImageFilenames([]);
            await fetchMarketingImages();
          } else {
            showToast(res.error || "Failed to clear images", "error");
          }
        } catch (err) {
          showToast("Error clearing images: " + (err as Error).message, "error");
        }
      }
    });
  };

  const handleUpdateAccountSchedule = async (params: {
    id: string;
    enabled?: boolean;
    frequency?: "every_cycle" | "daily" | "weekly" | "custom";
    customHours?: number;
    order?: number;
    useForNow?: boolean;
  }) => {
    try {
      const res = await api.updateProfileSchedule(params);
      if (res.success) {
        showToast("Account schedule updated.", "success");
        await fetchSchedulerStatus();
      } else {
        showToast(res.error || "Failed to update account schedule", "error");
      }
    } catch (err) {
      showToast("Error updating account: " + (err as Error).message, "error");
    }
  };

  const handleReorderAccounts = async (orderedIds: string[]) => {
    setIsSchedulerActionPending(true);
    // Optimistic local update
    if (schedulerData?.accounts) {
      const idToOrder = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
      const newAccounts = [...schedulerData.accounts].map(acc => {
        const ord = idToOrder.get(acc.id);
        return ord ? { ...acc, schedule: { ...acc.schedule, order: ord } } : acc;
      }).sort((a, b) => a.schedule.order - b.schedule.order);
      setSchedulerData({ ...schedulerData, accounts: newAccounts });
    }
    try {
      const res = await api.reorderSchedulerAccounts(orderedIds);
      if (res.success) {
        showToast("Account order updated successfully!", "success");
        await fetchSchedulerStatus();
      } else {
        showToast(res.error || "Failed to reorder accounts", "error");
      }
    } catch (err) {
      showToast("Error reordering accounts: " + (err as Error).message, "error");
    } finally {
      setIsSchedulerActionPending(false);
    }
  };

  const handleMoveAccount = async (index: number, action: "up" | "down" | "top" | "bottom") => {
    if (!schedulerData?.accounts) return;
    const sorted = [...schedulerData.accounts].sort((a, b) => a.schedule.order - b.schedule.order);
    if (index < 0 || index >= sorted.length) return;

    const item = sorted[index];
    const remaining = sorted.filter((_, idx) => idx !== index);
    let targetIdx = index;
    if (action === "up") targetIdx = Math.max(0, index - 1);
    else if (action === "down") targetIdx = Math.min(sorted.length - 1, index + 1);
    else if (action === "top") targetIdx = 0;
    else if (action === "bottom") targetIdx = remaining.length;

    remaining.splice(targetIdx, 0, item);
    const orderedIds = remaining.map(a => a.id);
    await handleReorderAccounts(orderedIds);
  };

  const handleMoveAccountOrder = handleMoveAccount;

  const handleDirectOrderInput = async (accId: string, newOrderVal: number) => {
    if (!schedulerData?.accounts) return;
    const sorted = [...schedulerData.accounts].sort((a, b) => a.schedule.order - b.schedule.order);
    const fromIdx = sorted.findIndex(a => a.id === accId);
    if (fromIdx === -1) return;

    const targetIdx = Math.max(0, Math.min(sorted.length - 1, newOrderVal - 1));
    if (fromIdx === targetIdx) return;

    const item = sorted[fromIdx];
    const remaining = sorted.filter((_, idx) => idx !== fromIdx);
    remaining.splice(targetIdx, 0, item);
    const orderedIds = remaining.map(a => a.id);
    await handleReorderAccounts(orderedIds);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedAccountIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedAccountIndex === null || draggedAccountIndex === targetIndex) {
      setDraggedAccountIndex(null);
      return;
    }
    if (!schedulerData?.accounts) return;
    const sorted = [...schedulerData.accounts].sort((a, b) => a.schedule.order - b.schedule.order);
    const item = sorted[draggedAccountIndex];
    const remaining = sorted.filter((_, idx) => idx !== draggedAccountIndex);
    remaining.splice(targetIndex, 0, item);
    setDraggedAccountIndex(null);
    const orderedIds = remaining.map(a => a.id);
    await handleReorderAccounts(orderedIds);
  };


  const isPostingActive =
    status === "Posting" ||
    isStartingPost ||
    isPending.post ||
    isContinuousLoopActive;

  const isBusy =
    status === "Fetching" ||
    status === "Generating" ||
    status === "Posting" ||
    status === "Authenticating" ||
    status === "Verifying Code" ||
    status === "Checking Login" ||
    isStartingPost ||
    isContinuousLoopActive ||
    isPending.fetch ||
    isPending.generate ||
    isPending.post ||
    isPending.full ||
    isPending.login ||
    isPending.clear ||
    (activeProcess !== "none" && activeProcess !== "") ||
    Boolean(schedulerData?.cycleRunning);

  const isSchedulerRunning = Boolean(schedulerData?.cycleRunning);

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

  // Global background polling for header status dot and scheduler badge every 30s
  useEffect(() => {
    let isMounted = true;
    const pollHeaderStatus = async () => {
      try {
        const [health, sched] = await Promise.all([
          api.getHealth().catch(() => null),
          api.getScheduler().catch(() => null),
        ]);
        if (isMounted) {
          if (health) setHealthData(health);
          if (sched) setSchedulerData(sched);
        }
      } catch (_) {}
    };

    pollHeaderStatus();
    const interval = setInterval(pollHeaderStatus, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Dashboard-specific polling (polls status, and output data only when a run is active)
  useEffect(() => {
    if (currentView !== "dashboard") return;
    let isMounted = true;

    fetchStats();
    fetchSessionDetails();
    fetchProfiles();
    fetchCoins();
    fetchMessages();
    fetchResults();

    const interval = setInterval(() => {
      if (!isMounted) return;
      fetchStats();
      if (status === "Posting" || status === "Fetching" || status === "Generating" || isContinuousLoopActive) {
        fetchCoins();
        fetchMessages();
        fetchResults();
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentView, status, isContinuousLoopActive]);

  // Logs-specific polling (polled only while /logs is open)
  useEffect(() => {
    if (currentView !== "logs") return;
    let isMounted = true;

    const pollLogs = async () => {
      if (!isMounted) return;
      await fetchLogs();
    };

    pollLogs();
    const interval = setInterval(pollLogs, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentView, logsTab]);

  // Health-specific polling (polled only while /health is open)
  useEffect(() => {
    if (currentView !== "health") return;
    let isMounted = true;

    const pollHealth = async () => {
      try {
        const data = await api.getHealth();
        if (isMounted && data) {
          setHealthData(data);
        }
      } catch (_) {}
    };

    pollHealth();
    const interval = setInterval(pollHealth, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentView]);

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
  const fetchCoins = async (overrideProfileId?: string) => {
    try {
      const pid = overrideProfileId !== undefined ? overrideProfileId : (activeProfileIdRef.current || activeProfile?.id || "");
      const query = pid ? `&profileId=${encodeURIComponent(pid)}` : "";
      const res = await apiFetch(resolveUrl(`/output/last_trending.json?t=${Date.now()}${query}`), { cache: "no-store" });
      const data = res.ok ? await res.json() : [];
      const arr = Array.isArray(data) ? data : [];
      setCoinsList(prev => areCoinsEqual(prev, arr) ? prev : arr);
    } catch (_) {}
  };

  // Fast fetch messages with O(1) equality check
  const fetchMessages = async (overrideProfileId?: string) => {
    try {
      const pid = overrideProfileId !== undefined ? overrideProfileId : (activeProfileIdRef.current || activeProfile?.id || "");
      const query = pid ? `&profileId=${encodeURIComponent(pid)}` : "";
      const res = await apiFetch(resolveUrl(`/output/generated_messages.json?t=${Date.now()}${query}`), { cache: "no-store" });
      const data = res.ok ? await res.json() : [];
      const arr = Array.isArray(data) ? data : [];
      setMessagesList(prev => areMessagesEqual(prev, arr) ? prev : arr);
    } catch (_) {}
  };

  // Fast fetch post submissions results with O(1) equality check
  const fetchResults = async (overrideProfileId?: string) => {
    try {
      const pid = overrideProfileId !== undefined ? overrideProfileId : (activeProfileIdRef.current || activeProfile?.id || "");
      const query = pid ? `&profileId=${encodeURIComponent(pid)}` : "";
      const res = await apiFetch(resolveUrl(`/output/results.json?t=${Date.now()}${query}`), { cache: "no-store" });
      const data = res.ok ? await res.json() : [];
      const arr: PostResult[] = Array.isArray(data) ? data : [];
      const filtered = pid ? arr.filter((r: any) => !r.profileId || r.profileId === pid) : arr;
      setResults(prev => areResultsEqual(prev, filtered) ? prev : filtered);
    } catch (_) {}
  };

  // Fetch Current logs with O(1) equality check (fetched only while /logs is open)
  const fetchLogs = async (overrideProfileId?: string) => {
    if (currentView !== "logs") return;
    try {
      const pid = overrideProfileId !== undefined ? overrideProfileId : (activeProfile?.id || "");
      const [res, schedData] = await Promise.all([
        apiFetch(resolveUrl(`/api/logs?profileId=${encodeURIComponent(pid)}&t=${Date.now()}`)),
        api.getSchedulerLogs().catch(() => ({ success: false, logs: [] as LogEntry[] }))
      ]);
      if (res.ok) {
        const data = await parseResponseJson(res, { logs: [] });
        const list = (data.logs || []).slice(-100);
        setLogsList(prev => areLogsEqual(prev, list) ? prev : list);
      }
      if (schedData && Array.isArray(schedData.logs)) {
        setSchedulerLogsList(prev => areLogsEqual(prev, schedData.logs) ? prev : schedData.logs);
      }
    } catch (_) {}
  };

  // Fetch Session details
  const fetchSessionDetails = async () => {
    try {
      const res = await apiFetch(resolveUrl("/api/get-session"));
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
      const res = await apiFetch(resolveUrl("/api/profiles"));
      if (res.ok) {
        const data = await parseResponseJson(res, { profiles: [] });
        const list = data.profiles || [];
        setProfilesList(prev => areProfilesEqual(prev, list) ? prev : list);
        const active = list.find((p: any) => p.isActive);
        if (active) {
          activeProfileIdRef.current = active.id;
        }
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

  const handleSaveProfile = async (name: string, stateJson: string, dailyPostLimit: number = 300, proxy: string = "") => {
    if (!name.trim() || !stateJson.trim()) {
      showToast("Please provide both profile name and cookies JSON.", "error");
      return;
    }
    try {
      const res = await apiFetch(resolveUrl("/api/save-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stateJson, dailyPostLimit: Math.max(1, dailyPostLimit || 300), proxy: proxy.trim() })
      });
      if (res.ok) {
        setNewProfileName("");
        setNewProfileJson("");
        setNewProfileLimit(300);
        setNewProfileProxy("");
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

  const handleUpdateProfileLimit = async (id: string, limit: number) => {
    try {
      const res = await apiFetch(resolveUrl("/api/update-profile-limit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dailyPostLimit: Math.max(1, limit || 300) })
      });
      const data = await parseResponseJson(res, {});
      if (res.ok) {
        setEditingLimitProfileId(null);
        fetchProfiles();
        fetchStats();
        showToast(`Daily post limit updated to ${limit} posts/day!`, "success");
      } else {
        showToast(data.error || "Failed to update daily post limit.", "error");
      }
    } catch (err) {
      showToast("Error updating limit: " + (err as Error).message, "error");
    }
  };

  const handleUpdateProfileProxy = async (id: string, proxy: string) => {
    try {
      const res = await apiFetch(resolveUrl("/api/update-profile-proxy"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, proxy: proxy.trim() })
      });
      const data = await parseResponseJson(res, {});
      if (res.ok) {
        setEditingProxyProfileId(null);
        fetchProfiles();
        showToast(proxy.trim() ? `Proxy updated for account!` : `Proxy cleared (using direct connection)`, "success");
      } else {
        showToast(data.error || "Failed to update proxy.", "error");
      }
    } catch (err) {
      showToast("Error updating proxy: " + (err as Error).message, "error");
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
    activeProfileIdRef.current = id;
    
    // Instant optimistic update in UI
    setProfilesList(prev => prev.map(p => ({ ...p, isActive: p.id === id })));
    const target = profilesList.find(p => p.id === id);
    if (target) {
      setActiveProfile({ ...target, isActive: true });
    }

    // Immediately sweep UI state so the old account data does not linger while switching
    setCoinsList([]);
    setMessagesList([]);
    setResults([]);
    setTotalCoins(0);
    setGeneratedCount(0);
    setPostedCount(0);
    setFailedCount(0);
    setProgressIndex(0);
    setCurrentCoin("N/A");

    showToast("Switching active account profile...", "process");

    try {
      const res = await apiFetch(resolveUrl("/api/activate-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        await Promise.all([
          fetchProfiles(),
          fetchSessionDetails(),
          fetchStats(),
          fetchCoins(id),
          fetchMessages(id),
          fetchResults(id),
          fetchLogs(id)
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
      const res = await apiFetch(resolveUrl("/api/delete-profile"), {
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
    const curPid = activeProfileIdRef.current || activeProfile?.id || "";
    try {
      const url = curPid
        ? resolveUrl(`/api/status?profileId=${encodeURIComponent(curPid)}&t=${reqTime}`)
        : resolveUrl(`/api/status?t=${reqTime}`);
      const res = await apiFetch(url);
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
        if (Array.isArray(data.results)) {
          const rawResList: PostResult[] = data.results;
          const resList = curPid
            ? rawResList.filter(r => !r.profileId || r.profileId === curPid)
            : rawResList;
          setResults(prev => areResultsEqual(prev, resList) ? prev : resList);
        }
        if (data.isDataStale !== undefined) {
          setIsDataStale(!!data.isDataStale);
        }
        setProgressIndex(data.progressIndex || 0);
        if (data.dailyPostCount !== undefined) {
          setDailyPostCount(data.dailyPostCount);
        }
        if (data.dailyPostLimit !== undefined) {
          setDailyPostLimit(data.dailyPostLimit);
        }
        if (data.lastPostDate) {
          setLastPostDate(data.lastPostDate);
        }
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
        if (data.storageInfo) {
          setStorageInfo(data.storageInfo);
        }
        setIsContinuousLoopActive(!!data.isContinuousLoopActive);
        setNextCycleStartTime(data.nextCycleStartTime);
        if (data.continuousLoopIntervalMinutes !== undefined && !isInitialIntervalLoaded.current) {
          setContinuousInterval(data.continuousLoopIntervalMinutes);
          isInitialIntervalLoaded.current = true;
        }
        if (data.activeProcess !== undefined) {
          setActiveProcess(data.activeProcess);
          setActiveProcessDescription(data.activeProcessDescription || "");
        }
        if (data.imageUploadEnabled !== undefined) {
          setImageUploadEnabled(Boolean(data.imageUploadEnabled));
        }
        if (data.imageSelectionMode) {
          setImageSelectionMode(data.imageSelectionMode);
        }
        if (data.activeImageIndex !== undefined) {
          setActiveImageIndex(data.activeImageIndex);
        }

        // Synchronize stopping & starting status
        if ((data.status === "Stopping" || data.isStopping) && data.status !== "Idle" && data.status !== "Completed") {
          setIsStoppingPost(true);
        } else {
          setIsStoppingPost(false);
          setIsStartingPost(false);
        }

        if (data.loginState) {
          const step = data.loginState.status === "requires_otp" ? "otp_required" : data.loginState.status;
          setLoginStep(prev => {
            // When in idle state waiting for user input, stay idle so user can enter new credentials
            if (prev === "idle") {
              return "idle";
            }
            if (step === "authenticating") return "authenticating";
            if (step === "requires_otp") return "otp_required";
            if (step === "success") return "success";
            if (step === "failed") return "failed";
            return prev;
          });
          if (step !== "idle" && data.loginState.message) {
            setLoginStatusMessage(data.loginState.message);
          }
        }
      }
    } catch (_) {}
  };

  const toggleContinuousLoop = async (active: boolean, intervalMins?: number) => {
    if (isSchedulerRunning) {
      showToast("Cannot change continuous loop while the multi-account scheduler is running.", "warning");
      return;
    }
    const prevActive = isContinuousLoopActive;
    const targetMins = intervalMins !== undefined ? intervalMins : continuousInterval;
    // Instant optimistic UI transition
    setIsContinuousLoopActive(active);
    showToast(
      active ? `Continuous automation activated (${targetMins}m gap)` : "Continuous automation halted",
      active ? "success" : "info",
      3000
    );
    try {
      const res = await apiFetch(resolveUrl("/api/set-continuous-loop"), {
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
      } else {
        setIsContinuousLoopActive(prevActive);
        const errData = await parseResponseJson(res, { error: "Could not update continuous loop" });
        showToast(errData.error || "Could not update continuous loop", "error");
      }
    } catch (_) {
      setIsContinuousLoopActive(prevActive);
    }
  };

  const saveIntervalToServer = async (mins: number) => {
    const safeMins = Math.max(5, mins);
    showToast(`Cooldown interval set to ${safeMins} minutes (min: 5m)`, "info", 2000);
    try {
      const res = await apiFetch(resolveUrl("/api/set-continuous-loop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes: safeMins }),
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
      const res = await apiFetch(resolveUrl("/api/check-system"));
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
      apiFetch(resolveUrl(`/output/last_trending.json?t=${Date.now()}`))
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          const arr = Array.isArray(data) ? data : [];
          setCoinsList(prev => areCoinsEqual(prev, arr) ? prev : arr);
        })
        .catch(() => {});
    } else if (activeTab === "comments" || activeTab === "reports") {
      apiFetch(resolveUrl(`/output/generated_messages.json?t=${Date.now()}`))
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          const arr = Array.isArray(data) ? data : [];
          setMessagesList(prev => areMessagesEqual(prev, arr) ? prev : arr);
        })
        .catch(() => {});
    } else if (activeTab === "images") {
      fetchMarketingImages();
    }
  }, [activeTab, status]);

  // Load marketing images on initial mount
  useEffect(() => {
    fetchMarketingImages();
  }, []);

  // Keyboard navigation for full lightbox image preview (Esc to close, ArrowLeft / ArrowRight to navigate)
  useEffect(() => {
    if (!previewModalImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewModalImage(null);
      } else if (e.key === "ArrowLeft") {
        const idx = marketingImages.findIndex((m) => m.filename === previewModalImage.filename);
        if (idx > 0) {
          setPreviewModalImage(marketingImages[idx - 1]);
        } else if (idx === 0 && marketingImages.length > 0) {
          setPreviewModalImage(marketingImages[marketingImages.length - 1]);
        }
      } else if (e.key === "ArrowRight") {
        const idx = marketingImages.findIndex((m) => m.filename === previewModalImage.filename);
        if (idx !== -1 && idx < marketingImages.length - 1) {
          setPreviewModalImage(marketingImages[idx + 1]);
        } else if (idx === marketingImages.length - 1) {
          setPreviewModalImage(marketingImages[0]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewModalImage, marketingImages]);

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
      const res = await apiFetch(resolveUrl(endpoint), options);
      const data = await parseResponseJson(res, {});
      if (data && data.error) {
        showToast(data.error, "error", 5000);
      } else if (data && data.status === "stale_warning") {
        setIsStartingPost(false);
        setStatus("Idle");
        setShowStaleWarningModal(true);
        showToast("Market data is >2 days old. We recommend fetching new coins before posting.", "info", 5000);
        return;
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
          if (data?.isStopping || data?.status === "Stopping") {
            showToast(data.message || "Stopping gracefully after current coin finishes...", "info", 4000);
          } else {
            showToast(data?.message || "Posting sequence stopped.", "info", 4000);
          }
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
        if (data?.isStopping || data?.status === "Stopping") {
          setIsStoppingPost(true);
          setStatus("Stopping");
        } else {
          setIsStoppingPost(false);
          setStatus("Idle");
        }
        fetchStats();
        setTimeout(() => fetchStats(), 1500);
      }
      if (endpoint.includes("post-chat")) {
        setIsStartingPost(false);
        setIsStoppingPost(false);
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
      if (endpoint.includes("fetch-trending") || endpoint.includes("generate-messages") || endpoint.includes("full-flow") || endpoint.includes("clear-all") || endpoint.includes("post-chat")) {
        setTimeout(() => {
          fetchCoins();
          fetchMessages();
          fetchResults();
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

  // Check if trending coins or generated comments are > 2 days old (48 hours)
  const isDataOlderThan2Days = () => {
    const now = Date.now();
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
    const coinsStale = (coinsList.length > 0 && coinsFetchedAt) ? (now - coinsFetchedAt > TWO_DAYS_MS) : false;
    const commentsStale = (messagesList.length > 0 && commentsGeneratedAt) ? (now - commentsGeneratedAt > TWO_DAYS_MS) : false;
    return isDataStale || coinsStale || commentsStale;
  };

  const handleRefreshFreshData = async (autoStartPosting = false) => {
    setIsRefreshingFreshData(true);
    setShowStaleWarningModal(false);
    showToast("Fetching live trending coins and generating fresh AI comments...", "process");
    try {
      const res = await apiFetch(resolveUrl("/api/fetch-and-generate-fresh"), { method: "POST" });
      if (res.ok) {
        const data = await parseResponseJson(res, {});
        await Promise.all([fetchCoins(), fetchMessages(), fetchResults(), fetchStats(), fetchLogs()]);
        setIsDataStale(false);
        showToast(`Refreshed ${data.coinsCount || ""} coins & ${data.messagesCount || ""} comments successfully!`, "success", 4000);
        if (autoStartPosting) {
          setIsStartingPost(true);
          await runCommand("/api/post-chat", "post", { force: true });
        }
      } else {
        const errData = await parseResponseJson(res, { error: "Failed to refresh market data." });
        showToast(errData.error || "Failed to refresh market data.", "error");
      }
    } catch (err) {
      showToast("Error refreshing market data: " + (err as Error).message, "error");
    } finally {
      setIsRefreshingFreshData(false);
    }
  };

  // Save state.json
  const handleSaveSession = async () => {
    if (!sessionJson.trim()) return;
    setIsPending(prev => ({ ...prev, login: true }));
    try {
      const res = await apiFetch(resolveUrl("/api/save-session"), {
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
        showToast(data.error || "Failed to parse session state JSON.", "error");
      }
    } catch (error) {
      showToast("Error saving session: " + (error as Error).message, "error");
    } finally {
      setIsPending(prev => ({ ...prev, login: false }));
    }
  };

  // Start credential-based login
  const handleStartLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showToast("Please fill in both email and password.", "error");
      return;
    }
    setLoginStep("authenticating");
    setLoginStatusMessage("Initializing secure browser, navigating to CoinMarketCap and entering credentials...");
    try {
      const res = await apiFetch(resolveUrl("/api/start-login"), {
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
      showToast("Please enter a valid verification code.", "error");
      return;
    }
    setLoginStep("authenticating");
    setLoginStatusMessage("Submitting 6-digit code and verifying active session, please wait...");
    try {
      const res = await apiFetch(resolveUrl("/api/submit-otp"), {
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
      await apiFetch(resolveUrl("/api/cancel-login"), { method: "POST" });
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
      await apiFetch(resolveUrl("/api/reset-login-state"), { method: "POST" });
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
      const res = await apiFetch(resolveUrl("/api/retry-single"), {
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
      const res = await apiFetch(resolveUrl("/api/set-run-mode"), {
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
    let matchesLevel = logFilter === "all" || l.level === logFilter;
    if (logFilter === "scheduler") {
      matchesLevel = l.message.includes("[SCHEDULER]") || l.message.includes("[SYNC]") || l.message.includes("Run finished") || l.message.includes("Sequential");
    }
    const matchesQuery = !logSearchQuery.trim() || l.message.toLowerCase().includes(logSearchQuery.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  const schedulerLogs = schedulerLogsList.filter(l => {
    const matchesQ = !schedulerLogQuery.trim() || l.message.toLowerCase().includes(schedulerLogQuery.toLowerCase());
    return matchesQ;
  });

  const filteredMarketingImages = marketingImages.filter((img) =>
    img.filename.toLowerCase().includes(imageSearchQuery.toLowerCase())
  );
  const totalImagePages = Math.max(1, Math.ceil(filteredMarketingImages.length / imagePageSize));
  const currentPageClamped = Math.min(Math.max(1, imagePage), totalImagePages);
  const paginatedMarketingImages = filteredMarketingImages.slice(
    (currentPageClamped - 1) * imagePageSize,
    currentPageClamped * imagePageSize
  );
  const totalMarketingBytes = marketingImages.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);

  // If company admin authentication is required and user is not authenticated, render login gate
  if (adminAuthRequired && !isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-emerald-500 selection:text-slate-950">
        {/* Subtle decorative background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          {/* Brand header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3.5 bg-gradient-to-tr from-emerald-500/20 to-indigo-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shadow-2xl shadow-emerald-500/10 mb-4 ring-1 ring-emerald-500/20">
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
                    Background daemon runs 24/7 until failure or admin stop
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
                    <span>Sign In to Bot Console</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-800/80 text-center text-sm text-slate-500">
              Authorized operators only. Contact your organization administrator for access credentials or a direct team link.
            </div>
          </div>

          <div className="text-center mt-6 text-sm text-slate-500 font-mono">
            CMC Operations Console &bull; Security Level: High
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Global Hidden File Input for Marketing Images (works across Dashboard, Scheduler, Guide, and Image Library) */}
      <input
        type="file"
        ref={imageFileInputRef}
        onChange={handleUploadMarketingImages}
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
      />
      
      {/* HEADER NAVBAR */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Brand & Left Actions */}
          <div className="flex items-center justify-between gap-3">
            <div
              onClick={() => navigateTo("dashboard")}
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group"
              title="Go to Dashboard"
            >
              <div className="p-2 sm:p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 animate-pulse flex-shrink-0 group-hover:border-emerald-500/40 transition">
                <Activity className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-emerald-300 transition flex items-center gap-2">
                  CoinMarketCap Bot Console
                </h1>
                <p className="text-[11px] text-slate-400 hidden sm:block">Automated Community Commenting and Growth Driver</p>
              </div>
            </div>

            {/* Mobile View: Quick Account Button in Brand Row for easy touch access */}
            <div className="flex lg:hidden items-center gap-1.5">
              <button
                onClick={() => {
                  handleResetLoginState();
                  setLoginTab("credentials");
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
                title="Add or Manage CoinMarketCap Accounts"
              >
                <Users className="h-3 w-3" />
                <span className="max-w-[90px] truncate">{activeProfile ? "+ Account" : (sessionExists ? "Active" : "Login")}</span>
              </button>
            </div>
          </div>

          {/* TOP CONTROLS & NAVIGATION ROW */}
          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 text-sm">
            {/* Desktop Account / Session Button */}
            <button
              onClick={() => {
                handleResetLoginState();
                setLoginTab("credentials");
                setShowSessionModal(true);
              }}
              className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold transition duration-200 cursor-pointer ${
                activeProfile 
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" 
                  : (sessionExists 
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" 
                    : "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 animate-pulse"
                  )
              }`}
              title="Add a new CoinMarketCap account or manage saved accounts"
              id="navbar-login-btn"
            >
              <Users className="h-3.5 w-3.5" />
              <span>
                {profilesList.length > 1
                  ? `+ Add / Accounts (${profilesList.length})`
                  : activeProfile
                    ? `Account: ${activeProfile.name}`
                    : sessionExists
                      ? "Account: Active"
                      : "Login / Add Account"}
              </span>
            </button>

            {/* Quick Account Switcher Dropdown - responsive across all screens */}
            {profilesList.length > 1 && (
              <div className={`flex items-center bg-slate-950 border rounded-lg px-2.5 py-1 sm:py-1.5 text-sm shadow-inner transition ${
                (isBusy || isPostingActive || isContinuousLoopActive) ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800'
              }`}>
                <span className="text-sm text-slate-400 font-mono mr-1.5 uppercase font-bold flex items-center gap-1">
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

            {/* Scheduler Screen Link Button (/scheduler) */}
            <button
              onClick={() => navigateTo(currentView === "scheduler" ? "dashboard" : "scheduler")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-sm font-bold transition duration-200 cursor-pointer shadow-sm ${
                currentView === "scheduler"
                  ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-300 ring-1 ring-indigo-500/30"
                  : schedulerData?.cycleRunning
                    ? "bg-indigo-950/60 border-indigo-500/50 text-indigo-300 animate-pulse"
                    : schedulerData?.enabled
                      ? "bg-indigo-950/40 border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-900/50"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Dedicated Sequential Multi-Account Scheduler & Settings Screen (/scheduler)"
            >
              <Clock className={`h-3.5 w-3.5 ${schedulerData?.cycleRunning ? "text-indigo-400 animate-spin" : (schedulerData?.enabled ? "text-indigo-400" : "text-slate-400")}`} />
              <span>Scheduler</span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                schedulerData?.cycleRunning
                  ? "bg-indigo-500 text-slate-950 animate-pulse"
                  : (schedulerData?.status === "paused" || schedulerData?.savedPosition)
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-slate-800 text-slate-400"
              }`}>
                {schedulerData?.cycleRunning
                  ? "Running"
                  : (schedulerData?.status === "paused" || schedulerData?.savedPosition)
                    ? "Paused"
                    : "Stopped"}
              </span>
            </button>

            {/* Admin Switch Button */}
            <button
              onClick={() => navigateTo(currentView === "admin" ? "dashboard" : "admin")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-sm font-bold transition duration-200 cursor-pointer ${
                currentView === "admin"
                  ? "bg-blue-600/30 border-blue-500/60 text-blue-300 ring-1 ring-blue-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Admin & System Diagnostics Console (/admin)"
            >
              <Shield className="h-3.5 w-3.5 text-blue-400" />
              <span>Admin</span>
            </button>

            {/* Logs Link Button (/logs) */}
            <button
              onClick={() => navigateTo(currentView === "logs" ? "dashboard" : "logs")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-sm font-bold transition duration-200 cursor-pointer ${
                currentView === "logs"
                  ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Activity Logs Console (/logs)"
            >
              <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
              <span>Logs</span>
            </button>

            {/* Health Link Button (/health) */}
            <button
              onClick={() => navigateTo(currentView === "health" ? "dashboard" : "health")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-sm font-bold transition duration-200 cursor-pointer ${
                currentView === "health"
                  ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open System Health & Diagnostics (/health)"
            >
              <span className={`w-2 h-2 rounded-full inline-block ${healthData?.overall === "ok" || healthData?.healthy ? "bg-emerald-400" : "bg-rose-500 animate-pulse"}`} />
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Health</span>
            </button>

            {/* QUICK START GUIDE BUTTON */}
            <button
              onClick={() => navigateTo(currentView === "guide" ? "dashboard" : "guide")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-sm font-bold transition duration-200 cursor-pointer ${
                currentView === "guide"
                  ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-300 shadow-sm shadow-indigo-500/20"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
              title="Open Quick Start Operating Guide (/guide)"
            >
              <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
              <span>Guide</span>
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD OR ADMIN SCREEN CONTENT BODY */}
      {currentView === "admin" ? (
        /* ADMIN SCREEN */
        <main key="view-admin" className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* ADMIN HEADER & NAVIGATION */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Admin & System Console
                  <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                    /admin
                  </span>
                </h1>
                <p className="text-sm text-slate-400">Select an administrative module below to inspect or configure</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateTo("health")}
                className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm"
              >
                <Activity className="h-4 w-4 text-emerald-400" /> System Health
              </button>
              <button
                onClick={() => navigateTo("dashboard")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* ADMIN 4-CARD MODULE SELECTOR DECK (Spacious, well-oriented, one module at a time) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <button
              onClick={() => setAdminSection("diagnostics")}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 ${
                adminSection === "diagnostics"
                  ? "bg-slate-900 border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-lg"
                  : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Activity className="h-4 w-4" />
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  systemCheckResult?.success ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-300"
                }`}>
                  {systemCheckResult?.success ? "HEALTHY" : "CHECK"}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">1. System Diagnostics</div>
                <div className="text-xs text-slate-400 mt-0.5">Playwright & Chromium binary check</div>
              </div>
            </button>

            <button
              onClick={() => setAdminSection("secrets")}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 ${
                adminSection === "secrets"
                  ? "bg-slate-900 border-blue-500/50 ring-1 ring-blue-500/30 shadow-lg"
                  : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Key className="h-4 w-4" />
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/20 text-blue-300">
                  {sessionExists ? "ACTIVE" : "SETUP"}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">2. API Keys & Storage</div>
                <div className="text-xs text-slate-400 mt-0.5">OpenAI, Gemini, CMC & session cache</div>
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
                  {telegramEnabled ? "ACTIVE" : "OFF"}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">3. Emergency Alerts</div>
                <div className="text-xs text-slate-400 mt-0.5">Telegram hotline & test alerts</div>
              </div>
            </button>

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
                <div className="text-sm font-bold text-white">4. Security & Sharing</div>
                <div className="text-xs text-slate-400 mt-0.5">Admin password & 1-click team link</div>
              </div>
            </button>
          </div>

          {/* 1. SYSTEM ENVIRONMENT DIAGNOSTICS CARD */}
          {adminSection === "diagnostics" && (
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
                      <span className="text-sm bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                        Healthy
                      </span>
                    ) : (
                      <span className="text-sm bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 font-medium">
                        Issue Detected
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-slate-400">Verifies backend browser runtimes, executable existence, and system libraries</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={checkSystemHealth}
                  disabled={isCheckingSystem}
                  className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-sm text-slate-300 font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isCheckingSystem ? "animate-spin" : ""}`} />
                  Re-Run Diagnostics
                </button>
              </div>
            </div>

            {!systemCheckResult ? (
              <div className="py-6 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-sm">Querying system dependencies check...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3 border-r border-slate-800/60 pr-6">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</h3>
                  
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
                      <h4 className="text-sm font-semibold text-white font-mono">Playwright</h4>
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
                      <h4 className="text-sm font-semibold text-white font-mono">Chromium Binary</h4>
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
                      <h4 className="text-sm font-semibold text-white font-mono">Shared OS Libraries</h4>
                      <p className="text-[10px] text-slate-400">
                        {systemCheckResult.launchStatus === "success" ? "All OS dependencies satisfied" : "Missing shared libraries detected"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-3 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Environment Details</h3>
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
          )}

          {/* 2. TWO-COLUMN GRID: API SECRETS MATRIX & STORAGE CACHE MAINTENANCE */}
          {adminSection === "secrets" && (
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
                    <div className="text-sm font-bold text-white font-mono truncate">
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
                    <div className="text-sm font-bold text-white font-mono truncate">
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
                    <div className="text-sm font-bold text-white font-mono truncate">
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
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2 text-sm">
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
                            <span className="text-emerald-400 font-bold text-sm">{activeProfile.name}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-400 font-medium bg-amber-500/5 p-2 rounded border border-amber-500/10">
                        No active state.json session found.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setLoginTab("cookies");
                        setShowSessionModal(true);
                      }}
                      disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                      className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 font-semibold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Upload className="h-3.5 w-3.5" /> Configure Cookies
                    </button>
                    <button
                      onClick={() => runCommand("/api/check-login", "login")}
                      disabled={isPending.login || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                      className="py-2.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 font-semibold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                        onClick={() =>
                          setInlineConfirmModal({
                            isOpen: true,
                            title: "Delete Session Cookies?",
                            message: "This will remove auth/state.json and sign out the current active browser session.",
                            onConfirm: () => runCommand("/api/clear-session", "login"),
                          })
                        }
                        disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="py-2.5 px-3 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 font-medium text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete state.json
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span><strong className="text-white">Notice:</strong> Browser contexts and cookies are stored securely on the backend container.</span>
                <button
                  onClick={() => {
                    setLoginTab("profiles");
                    setShowSessionModal(true);
                  }}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg font-bold transition cursor-pointer shrink-0"
                >
                  Manage Profiles ({profilesList.length})
                </button>
              </div>
            </section>
          </div>
          )}

          {/* 3. TELEGRAM EMERGENCY ALERTS SYSTEM */}
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
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-white text-base">Emergency Telegram Alerts (Insane Failures Only)</h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                      telegramEnabled ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-slate-800 text-slate-400"
                    }`}>
                      {telegramEnabled ? "High-Alert Mode" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Dispatches instant Telegram notifications ONLY when manual interaction is required (all accounts session out, 24-part background cycle stalled, continuous loop aborted, or deployment build failure).
                  </p>
                </div>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-xl">
                <span className="text-sm font-semibold text-slate-300">Emergency Alerts</span>
                <button
                  type="button"
                  onClick={() => handleToggleTelegram(!telegramEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    telegramEnabled ? "bg-rose-600" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      telegramEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
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
                      className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                    >
                      {isDetectingTelegram ? "Detecting..." : "Re-Detect"}
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
      ) : currentView === "scheduler" ? (
        /* DEDICATED ISOLATED MULTI-ACCOUNT SCHEDULER SCREEN (/scheduler) */
        <main key="view-scheduler" className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* SCHEDULER HEADER & CONTROLS DECK */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                  Sequential Multi-Account Scheduler
                  <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                    /scheduler
                  </span>
                  <span className={`px-2.5 py-0.5 text-xs rounded-full font-mono font-semibold uppercase tracking-wider ${
                    schedulerData?.enabled
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}>
                    {schedulerData?.enabled ? "Scheduler Enabled" : "Scheduler Disabled"}
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Fully isolated multi-account automation: rotates through accounts in order. Completely separated from manual single-account posting.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setLogsTab("scheduler");
                  navigateTo("logs");
                }}
                className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm"
                title="View live Scheduler Execution Logs (/logs)"
              >
                <TerminalIcon className="h-4 w-4 text-indigo-400" /> Scheduler Logs
              </button>
              <button
                onClick={() => navigateTo("dashboard")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* TOP MASTER SWITCH & CYCLE METRICS PANEL */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Scheduler Engine Controls</span>
                  {schedulerData?.cycleRunning && (
                    <span className="px-2 py-0.5 text-xs rounded-full font-mono font-bold bg-indigo-500 text-slate-950 animate-pulse">
                      CYCLE IN PROGRESS
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-400">
                  When enabled, the bot runs 4 daily cycles across queued accounts (runtime is automatically deducted so all 4 cycles finish within 24 hours).
                </p>
              </div>

              {/* Master Switch: Run accounts in sequence (Prominent, Easily Detectable Action Bar) */}
              <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all duration-150 ${
                schedulerData?.enabled
                  ? "bg-indigo-950/50 border-indigo-500/40 shadow-md shadow-indigo-500/10"
                  : "bg-slate-900/90 border-slate-700/80"
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    schedulerData?.enabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        Run accounts in sequence
                      </span>
                      <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-md border ${
                        schedulerData?.enabled
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {schedulerData?.enabled ? "ENABLED • 24/7 ACTIVE" : "DISABLED"}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 block">
                      {schedulerData?.enabled
                        ? "Multi-account sequential queue is armed and ready"
                        : "Click to arm automatic multi-account rotation"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSchedulerActionPending || isSchedulerRunning}
                  onClick={() => handleToggleScheduler()}
                  title={isSchedulerRunning ? "Pause or stop the active cycle before disabling sequential mode" : (schedulerData?.enabled ? "Click to disable sequential scheduler" : "Click to enable sequential scheduler")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
                    schedulerData?.enabled
                      ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                  }`}
                >
                  {isSchedulerActionPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : schedulerData?.enabled ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>
                    {schedulerData?.enabled ? "Sequential Mode ON (Disable)" : "Enable Sequential Mode"}
                  </span>
                </button>
              </div>
            </div>

            {/* CYCLE STATUS & CONTROLS BAR */}
            {isSchedulerRunning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium">
                Settings are locked while the scheduler is running. Pause or stop to change them.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              {/* Status & Current Account */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cycle State</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {schedulerData?.dailyCycleCount || 0}/{schedulerData?.maxCyclesPerDay || 4} Today
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${schedulerData?.cycleRunning ? "bg-indigo-400 animate-ping" : schedulerData?.savedPosition ? "bg-amber-400" : "bg-slate-500"}`} />
                    <span className="text-base font-bold text-white">
                      {schedulerData?.cycleRunning ? "Cycle Running" : schedulerData?.savedPosition ? "Cycle Paused" : schedulerData?.enabled ? "Scheduled & Ready" : "Standby"}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-400 truncate pt-1">
                  {schedulerData?.cycleRunning ? (
                    <>Current: <span className="font-semibold text-slate-200">
                      {(() => {
                        if (!schedulerData?.currentAccountId) return "None";
                        const cur = schedulerData.accounts.find(a => a.id === schedulerData.currentAccountId);
                        return cur ? cur.name : schedulerData.currentAccountId;
                      })()}
                    </span></>
                  ) : schedulerData?.nextCycleAt ? (
                    <>Next Run: <span className="font-mono font-semibold text-emerald-400">{new Date(schedulerData.nextCycleAt).toLocaleTimeString()}</span></>
                  ) : (
                    <>Next Run: <span className="text-slate-500">Auto-scheduled on enable</span></>
                  )}
                </div>
              </div>

              {/* Interval Settings */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cycle Interval</span>
                  <span className="text-xs text-indigo-400 font-mono font-bold">{schedulerData?.intervalMinutes || 360}m (4x / 24h)</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    disabled={isSchedulerActionPending || isSchedulerRunning}
                    value={schedulerIntervalInput}
                    onChange={(e) => setSchedulerIntervalInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white text-center font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={() => handleUpdateSchedulerInterval(schedulerIntervalInput)}
                    disabled={isSchedulerActionPending || isSchedulerRunning}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg shadow transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  Runtime deducted automatically for 24h schedule
                </div>
              </div>

              {/* Target Batch Limit (Coins / Run) */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Target Coins / Cycle</span>
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {targetCoinsCount === 0 ? "ALL Coins" : `Top ${targetCoinsCount}`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {[10, 30, 50, 0].map((count) => (
                    <button
                      key={count}
                      type="button"
                      disabled={isSchedulerActionPending || isSchedulerRunning}
                      onClick={() => handleUpdateTargetCoins(count)}
                      className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        targetCoinsCount === count
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
                      }`}
                      title={count === 0 ? "Process all trending coins (Default recommended - 300 posts/day cap)" : `Process top ${count} coins`}
                    >
                      {count === 0 ? "ALL" : `Top ${count}`}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-400">
                  ALL = Default recommended (Cap: 300 posts/day)
                </div>
              </div>

              {/* Cycle Action Buttons */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Cycle Execution Controls
                  </span>
                  {schedulerData?.cycleRunning && (
                    <span className="text-[11px] font-mono font-bold text-indigo-400 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || schedulerData?.cycleRunning || isBusy}
                    onClick={schedulerData?.savedPosition ? handleResumeScheduler : handleRunSchedulerNow}
                    title={isBusy ? "Cannot start scheduler cycle: another process is currently running." : (schedulerData?.savedPosition ? "Resume sequential cycle from saved position" : "Start sequential cycle immediately (auto-enables scheduler if needed)")}
                    className="flex-1 px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-500/20 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isSchedulerActionPending && !schedulerData?.cycleRunning ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-white" />
                    )}
                    <span>
                      {schedulerData?.cycleRunning
                        ? "Cycle Running..."
                        : schedulerData?.savedPosition
                          ? "Resume Cycle"
                          : "Run cycle now"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || !schedulerData?.cycleRunning}
                    onClick={handlePauseScheduler}
                    className="px-3 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-xl shadow transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>Pause</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulerActionPending || (!schedulerData?.cycleRunning && !schedulerData?.enabled && !schedulerData?.savedPosition)}
                    onClick={handleStopScheduler}
                    className="px-3 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-xl shadow transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>Stop</span>
                  </button>
                </div>
                <div className="text-xs text-slate-400 text-center">
                  1-click start • Live state updates every 3s
                </div>
              </div>
            </div>

            {/* MARKETING IMAGE UPLOAD CONTROLS FOR SCHEDULED CYCLES */}
            <div className="mt-3 pt-4 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-indigo-500/20">
              <div className="flex items-center gap-3">
                <span className={`p-2.5 rounded-xl border ${
                  imageUploadEnabled
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}>
                  <ImageIcon className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">Scheduled Cycle Image Attachment</span>
                    <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                      imageUploadEnabled
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}>
                      {imageUploadEnabled
                        ? `ACTIVE • ${marketingImages.length} Images (${imageSelectionMode === "cycle" ? "Sequential" : "Random"})`
                        : "PAUSED • Text-Only Mode"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Control whether scheduled multi-account cycles attach 1 marketing graphic per comment or post text-only.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleImageUpload()}
                  disabled={isUpdatingImageSettings}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 cursor-pointer border ${
                    imageUploadEnabled
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                  }`}
                >
                  {imageUploadEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{imageUploadEnabled ? "Pause Image Upload" : "Enable Image Upload"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  disabled={isUploadingImages}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isUploadingImages ? "Uploading..." : "+ Upload Images"}</span>
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
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Open Image Library ({marketingImages.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* ACTIVE VS BACKUP & MANUAL CHECK NOTICE BANNER */}
          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 flex items-start gap-3">
            <Info className="h-4.5 w-4.5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300 leading-relaxed space-y-1">
              <div>
                <strong className="text-white">Active vs. Backup Accounts:</strong> Check <span className="text-emerald-400 font-semibold font-mono">Use this account for now</span> on the accounts you want to post in the cycle (e.g. 3 primary accounts). Unchecked accounts act as <span className="text-amber-300 font-semibold">Standby / Backup</span>—their login sessions remain safely stored in Firestore and on disk, and you can activate them at any time with one click.
              </div>
              <div className="text-[11px] text-slate-400">
                Uploaded marketing images, AI commentary, and human cooldown timers work automatically across all scheduled posting cycles.
              </div>
            </div>
          </div>

          {/* ACCOUNTS SCHEDULE TABLE */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Configured Accounts & Execution Order</span>
                  <span className="text-sm font-normal text-slate-400">
                    ({schedulerData?.accounts?.length || 0} accounts)
                  </span>
                </h4>
                <span className="text-sm text-slate-400">
                  Accounts run strictly sequentially: Account 1, then Account 2, then Account 3.
                </span>
              </div>
              <button
                onClick={() => {
                  handleResetLoginState();
                  setLoginTab("credentials");
                  setShowSessionModal(true);
                }}
                className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shrink-0"
              >
                <Users className="h-4 w-4 text-indigo-400" />
                <span>+ Add / Manage Accounts</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <th className="py-3 px-4 font-semibold text-center w-24">Order</th>
                    <th className="py-3 px-4 font-semibold">Account</th>
                    <th className="py-3 px-4 font-semibold min-w-[220px]">Use this account for now</th>
                    <th className="py-3 px-4 font-semibold min-w-[200px]">Posting Frequency</th>
                    <th className="py-3 px-4 font-semibold min-w-[180px]">Last Run</th>
                    <th className="py-3 px-4 font-semibold min-w-[150px]">Next Due</th>
                    <th className="py-3 px-4 font-semibold text-center w-32">Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {(!schedulerData?.accounts || schedulerData.accounts.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2.5">
                          <span className="italic">No profiles found. Add or import an account profile to start scheduling.</span>
                          <button
                            onClick={() => {
                              handleResetLoginState();
                              setLoginTab("credentials");
                              setShowSessionModal(true);
                            }}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Users className="h-3.5 w-3.5" /> + Add New Account
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    [...schedulerData.accounts]
                      .sort((a, b) => a.schedule.order - b.schedule.order)
                      .map((acc, index, sortedArr) => {
                        const isCurrent = acc.id === schedulerData.currentAccountId;
                        const isFirst = index === 0;
                        const isLast = index === sortedArr.length - 1;
                        const isCheckedNow = acc.schedule.frequency === "weekly"
                          ? Boolean(acc.schedule.useForNow)
                          : Boolean(acc.schedule.enabled);

                        return (
                          <tr
                            key={acc.id}
                            draggable={!isSchedulerRunning}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            className={`transition-all duration-150 select-none ${
                              draggedAccountIndex === index
                                ? "opacity-30 border-2 border-dashed border-indigo-400 bg-indigo-950/40"
                                : "hover:bg-slate-900/60"
                            } ${
                              isCurrent ? "bg-indigo-950/30 border-l-4 border-indigo-500" : ""
                            }`}
                          >
                            {/* Order, Drag Handle, Quick Position Select & Movement Arrows */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Drag grip handle */}
                                <div
                                  title={isSchedulerRunning ? "Reordering is locked while scheduler is running" : "Drag row to reorder"}
                                  className={`p-1 rounded transition ${isSchedulerRunning ? 'cursor-not-allowed opacity-30 text-slate-600' : 'cursor-grab active:cursor-grabbing text-slate-500 hover:text-indigo-400 hover:bg-slate-800'}`}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>

                                {/* Direct position number dropdown */}
                                <select
                                  disabled={isSchedulerRunning}
                                  value={acc.schedule.order}
                                  onChange={(e) => handleDirectOrderInput(acc.id, parseInt(e.target.value) || 1)}
                                  className="bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded px-1.5 py-0.5 text-sm font-mono font-bold text-indigo-300 focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={isSchedulerRunning ? "Locked while scheduler is running" : "Click to pick position number directly"}
                                >
                                  {sortedArr.map((_, pIdx) => (
                                    <option key={pIdx + 1} value={pIdx + 1}>
                                      #{pIdx + 1}
                                    </option>
                                  ))}
                                </select>

                                {/* Quick navigation arrows (up / down) */}
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    type="button"
                                    disabled={isFirst || isSchedulerRunning}
                                    onClick={() => handleMoveAccount(index, "up")}
                                    className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                                    title="Move 1 step up"
                                    aria-label="Move 1 step up"
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLast || isSchedulerRunning}
                                    onClick={() => handleMoveAccount(index, "down")}
                                    className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                                    title="Move 1 step down"
                                    aria-label="Move 1 step down"
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Account name & info */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-white text-base flex items-center gap-1.5">
                                  {acc.name}
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.2 bg-indigo-500 text-slate-950 text-[9px] font-bold rounded animate-pulse">
                                      RUNNING NOW
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                                  {acc.id}
                                </span>
                              </div>
                            </td>

                            {/* Checkbox: Use this account for now (Manual weekly checking) */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1 items-start">
                                <label className={`inline-flex items-center gap-2 group select-none ${isSchedulerRunning ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                                  <input
                                    type="checkbox"
                                    disabled={isSchedulerRunning}
                                    checked={isCheckedNow}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      if (acc.schedule.frequency === "weekly") {
                                        handleUpdateAccountSchedule({
                                          id: acc.id,
                                          enabled: true,
                                          useForNow: checked,
                                        });
                                      } else {
                                        handleUpdateAccountSchedule({
                                          id: acc.id,
                                          enabled: checked,
                                          useForNow: checked,
                                        });
                                      }
                                    }}
                                    className="h-4.5 w-4.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950 transition cursor-pointer accent-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                  <span className={`text-sm font-semibold transition ${
                                    isCheckedNow ? "text-emerald-300 font-bold" : "text-slate-300 group-hover:text-white"
                                  }`}>
                                    Use this account for now
                                  </span>
                                </label>

                                {/* Contextual status badges */}
                                {acc.schedule.frequency === "weekly" ? (
                                  <div className="pl-6.5">
                                    {acc.schedule.useForNow ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                        <CheckCircle className="h-3 w-3" />
                                        Manually checked for this week
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-amber-300/90 italic flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-amber-400" />
                                        Weekly account: check manually when ready
                                      </span>
                                    )}
                                  </div>
                                ) : acc.schedule.enabled ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/90 pl-6.5 font-mono font-medium">
                                    <CheckCircle className="h-3 w-3 text-emerald-400" />
                                    Active Primary (In cycle)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 pl-6.5 font-medium">
                                    <Shield className="h-3 w-3 text-amber-500/80" />
                                    Standby / Backup (Reserved)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Frequency dropdown & custom input */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <select
                                  disabled={isSchedulerRunning}
                                  value={acc.schedule.frequency}
                                  onChange={(e) =>
                                    handleUpdateAccountSchedule({
                                      id: acc.id,
                                      frequency: e.target.value as any,
                                      ...(e.target.value === "custom" && !acc.schedule.customHours ? { customHours: 24 } : {})
                                    })
                                  }
                                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <option value="every_cycle">Every cycle</option>
                                  <option value="daily">Daily (24h)</option>
                                  <option value="weekly">Weekly (Manual check)</option>
                                  <option value="custom">Custom hours</option>
                                </select>

                                {acc.schedule.frequency === "custom" && (
                                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                                    <input
                                      type="number"
                                      min={1}
                                      max={720}
                                      disabled={isSchedulerRunning}
                                      value={acc.schedule.customHours || 24}
                                      onChange={(e) => {
                                        const val = Math.min(720, Math.max(1, parseInt(e.target.value) || 1));
                                        handleUpdateAccountSchedule({ id: acc.id, customHours: val });
                                      }}
                                      className="w-12 bg-transparent text-sm text-white text-center focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-[10px] text-slate-400">hrs</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Last run (time + status badge + posted/failed) */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    {acc.lastRun.at ? new Date(acc.lastRun.at).toLocaleString() : "Never run"}
                                  </span>
                                  {acc.lastRun.status && (
                                    <span className={`px-1.5 py-0.5 text-[9px] rounded font-semibold uppercase ${
                                      acc.lastRun.status === "completed"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : acc.lastRun.status === "skipped_not_due"
                                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                          : acc.lastRun.status === "skipped_missing_session"
                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                            : acc.lastRun.status === "skipped_expired"
                                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                              : acc.lastRun.status === "stopped_daily_limit"
                                                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                                : acc.lastRun.status === "stopped_captcha"
                                                  ? "bg-rose-600/30 text-rose-200 border border-rose-500"
                                                  : acc.lastRun.status === "stopped_by_user"
                                                    ? "bg-amber-600/20 text-amber-300 border border-amber-500/30"
                                                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                                    }`}>
                                      {acc.lastRun.status.replace(/_/g, " ")}
                                    </span>
                                  )}
                                </div>
                                {acc.lastRun.at && (
                                  <span className="text-xs font-mono text-slate-300">
                                    <span className="text-emerald-400 font-bold">{acc.lastRun.posted} verified posted</span>,{" "}
                                    <span className={acc.lastRun.failed > 0 ? "text-rose-400 font-bold" : "text-slate-400"}>{acc.lastRun.failed} failed/unposted</span>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Next due */}
                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              {acc.schedule.enabled === false ? (
                                <span className="text-slate-500 italic">Disabled</span>
                              ) : acc.schedule.useForNow ? (
                                <span className="text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Due now (Checked)
                                </span>
                              ) : acc.schedule.frequency === "every_cycle" ? (
                                <span className="text-indigo-400 font-semibold">Every cycle</span>
                              ) : acc.schedule.frequency === "weekly" ? (
                                <span className="text-amber-300/80 italic">Check box when ready</span>
                              ) : acc.nextDueAt ? (
                                <div className="flex flex-col">
                                  <span className="text-slate-300">{new Date(acc.nextDueAt).toLocaleString()}</span>
                                  <span className="text-[10px] text-slate-500">
                                    {new Date(acc.nextDueAt).getTime() <= Date.now() ? "Due now" : "Upcoming"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-emerald-400 font-semibold">Due now</span>
                              )}
                            </td>

                            {/* Session */}
                            <td className="py-3.5 px-4 text-center">
                              {acc.hasValidSession ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle className="h-3 w-3" />
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  <AlertTriangle className="h-3 w-3" />
                                  Missing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      ) : currentView === "guide" ? (
        /* DEDICATED OPERATING GUIDE SCREEN (/guide) */
        <main key="view-guide" className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Beginner & Operating Guide
                  <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                    /guide
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Interactive step-by-step walkthrough for setting up accounts, generating AI comments, and automating CoinMarketCap posts
                </p>
              </div>
            </div>
            <button
              onClick={() => navigateTo("dashboard")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md self-start sm:self-auto"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
          </div>

          {/* BEGINNER 3-STEP QUICK WORKFLOW BANNER */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-2.5">
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
                      Log in with your email/password or import cookies so the browser can post comments on your behalf.
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
                    <Users className="h-4 w-4" /> + Add CoinMarketCap Account
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
                      On the Dashboard, click <strong>Get trending coins</strong> and then <strong>Write comments</strong> (or click <strong>Run Full Automated Bot Cycle</strong>).
                    </p>
                  </div>
                  <button
                    onClick={() => navigateTo("dashboard")}
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
                      Post immediately with <strong>Start Posting</strong>, or use the <strong>Scheduler</strong> to rotate through multiple accounts automatically.
                    </p>
                  </div>
                  <button
                    onClick={() => navigateTo("scheduler")}
                    className="w-full py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="h-4 w-4" /> Open Multi-Account Scheduler
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
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-blue-400 font-bold block">
                        Section 1 • Readiness Checklist
                      </span>
                      <h2 className="text-base font-bold text-white">Getting started</h2>
                      <p className="text-sm text-slate-400">Core requirements before your first run</p>
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
                    "Connect at least one active CoinMarketCap account before running automated workflows.",
                    "Configure your OpenAI or Gemini API key in the environment to generate authentic comments.",
                    "Review your daily post limit and cooldown gap settings to prevent spam rate limits.",
                    "Verify that your database connection is active to preserve persistent session states.",
                    "Monitor the Health page to ensure all dependencies and credentials are green."
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
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold block">
                        Section 2 • Accounts & Cookies
                      </span>
                      <h2 className="text-base font-bold text-white">Adding an account</h2>
                      <p className="text-sm text-slate-400">Profile management and session isolation</p>
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
                    <Users className="h-4 w-4" /> + Add Account
                  </button>
                </div>
                <ul className="space-y-2.5">
                  {[
                    "Click the Account button in the top header bar to open the account management dialog.",
                    "Enter your email and password for automatic browser login with Playwright.",
                    "Alternatively, import existing cookies or storage state JSON from an authenticated browser.",
                    "Assign an optional residential proxy to isolate account IP addresses and avoid bans.",
                    "Keep 3 primary accounts active and 2 standby accounts for auto-failover protection."
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
                <span><strong className="text-slate-200">Beginner Tip:</strong> Each account has its own isolated cookies, coin list, and post history.</span>
              </div>
            </div>
            )}

            {/* 3. Running the scheduler (start, pause, stop, resume) */}
            {(guideStep === "all" || guideStep === "scheduler") && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 md:col-span-2 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold block">
                      Section 3 • Multi-Account Automation
                    </span>
                    <h2 className="text-base font-bold text-white">Running the scheduler (start, pause, stop, resume)</h2>
                    <p className="text-sm text-slate-400">Sequential account rotation, saved progress, and live controls</p>
                  </div>
                </div>
                <button
                  onClick={() => navigateTo("scheduler")}
                  className="px-3.5 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                >
                  <Clock className="h-4 w-4" /> Open Scheduler
                </button>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  "Start: Click Start in the Scheduler tab to begin sequential posting across active accounts.",
                  "Pause: Click Pause to finish posting to the current coin and then halt execution gracefully.",
                  "Resume: Click Resume to continue posting to the remaining coins right from where you paused.",
                  "Stop: Click Stop to cancel the active cycle once the in-flight coin completes.",
                  "Position and progress are automatically saved across server restarts and page refreshes.",
                  "Settings are locked while running; pause or stop the scheduler to adjust intervals or accounts."
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
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-purple-400 font-bold block">
                        Section 4 • Chart & Graphic Attachments
                      </span>
                      <h2 className="text-base font-bold text-white">Images</h2>
                      <p className="text-sm text-slate-400">Attaching graphics and rotation rules</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => imageFileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" /> + Upload
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab("images");
                        navigateTo("dashboard");
                        setTimeout(() => {
                          document.getElementById("storage-explorer")?.scrollIntoView({ behavior: "smooth" });
                        }, 120);
                      }}
                      className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-purple-400 border border-slate-800 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <ImageIcon className="h-3.5 w-3.5" /> Images Library ({marketingImages.length})
                    </button>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {[
                    "Upload promotional marketing graphics in PNG, JPG, or WEBP format in the Images section.",
                    "Enable 'Marketing Image Upload' to attach strictly one branded graphic with each comment.",
                    "Choose 'Cycle' mode to rotate through images sequentially or 'Random' mode for variety.",
                    "Use Auto-Prune to retain the latest uploaded graphics and automatically clean older files."
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
                <span><strong className="text-slate-200">Beginner Tip:</strong> Image attachment can be paused or enabled anytime on the Dashboard or Scheduler.</span>
              </div>
            </div>
            )}

            {/* 5. If something goes wrong */}
            {(guideStep === "all" || guideStep === "troubleshooting") && (
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 animate-in fade-in duration-200 ${guideStep !== "all" ? "md:col-span-2" : ""}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold block">
                        Section 5 • Help & Recovery
                      </span>
                      <h2 className="text-base font-bold text-white">If something goes wrong</h2>
                      <p className="text-sm text-slate-400">Troubleshooting, error diagnostics, and recovery</p>
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
                    "Check the Health page (/health) to immediately identify degraded services or missing keys.",
                    "If an account session expires, click Check login and re-authenticate or re-import cookies.",
                    "If comment generation fails, verify your OpenAI credit balance or switch to Gemini.",
                    "Review real-time diagnostic output in the Activity Logs (/logs) to view error traces.",
                    "Failed coins are automatically queued for retry without disrupting the remaining queue."
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
      ) : currentView === "logs" ? (
        /* DEDICATED LOGS SCREEN (/logs) */
        <main key="view-logs" className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <TerminalIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Activity Logs
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    /logs
                  </span>
                </h1>
                <p className="text-sm text-slate-400">System Activity and Console Output</p>
              </div>
            </div>

            {/* Sub-tab Switcher & Dashboard Return */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setLogsTab("system")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    logsTab === "system"
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <TerminalIcon className="h-3.5 w-3.5" />
                  <span>System Activity</span>
                </button>
                <button
                  onClick={() => setLogsTab("scheduler")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    logsTab === "scheduler"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Scheduler Logs</span>
                </button>
              </div>

              <button
                onClick={() => navigateTo("dashboard")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* TAB 1: SYSTEM ACTIVITY LOGS */}
          {logsTab === "system" ? (
            <section className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div className="flex flex-col gap-3.5 mb-3.5 border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-white tracking-tight flex items-center gap-2">
                      <span className="p-1.5 bg-slate-800 text-emerald-400 rounded-lg border border-slate-700">
                        <TerminalIcon className="h-4 w-4" />
                      </span>
                      Activity
                    </h2>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800 font-medium" title="Logs are kept to a maximum of 100 entries with automatic rotation to prevent memory leaks">
                      Ring Buffer: {filteredLogs.length}/100 max (auto-rotates)
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setInlineConfirmModal({
                        isOpen: true,
                        title: "Clear System Activity & Storage",
                        message: "Clear local console logs and queued coins/comments for the active account? Posted submission history is preserved.",
                        onConfirm: () => runCommand("/api/clear-all", "clear")
                      })
                    }
                    disabled={isPending.clear}
                    className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 cursor-pointer"
                    title="Clear console"
                    aria-label="Clear console"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter logs by keyword..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 placeholder-slate-600 font-mono"
                  />

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
                    aria-label="Toggle auto-scroll"
                  >
                    <ArrowDown className={`h-3 w-3 ${autoScroll ? "animate-pulse" : ""}`} />
                    Scroll: {autoScroll ? "ON" : "PAUSED"}
                  </button>

                  <select
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-semibold text-slate-400 cursor-pointer focus:outline-none focus:border-emerald-500"
                    aria-label="Filter logs by level"
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
                className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[460px] overflow-y-auto font-mono text-[11px] space-y-1.5 leading-relaxed shadow-inner"
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
          ) : (
            /* TAB 2: SCHEDULER LOGS WITH SINGLE DOWNLOAD LINK */
            <section className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-slate-800 text-indigo-400 rounded-lg border border-slate-700">
                    <Clock className="h-4 w-4" />
                  </span>
                  <h2 className="font-bold text-white tracking-tight">Scheduler Execution Log</h2>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                    {schedulerLogs.length} events
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter scheduler logs..."
                    value={schedulerLogQuery}
                    onChange={(e) => setSchedulerLogQuery(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 placeholder-slate-600 font-mono w-48"
                  />
                  <a
                    href="/api/scheduler/logs/download"
                    download="scheduler_execution.log"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Scheduler Logs</span>
                  </a>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[460px] overflow-y-auto font-mono text-xs space-y-1.5 leading-relaxed shadow-inner">
                {schedulerLogs.length === 0 ? (
                  <div className="text-slate-600 italic text-center pt-12">No scheduler logs recorded yet.</div>
                ) : (
                  schedulerLogs
                    .filter(l => !schedulerLogQuery || l.message.toLowerCase().includes(schedulerLogQuery.toLowerCase()))
                    .map((l, idx) => {
                      const isErr = l.level === "error";
                      const isWarn = l.level === "warning";
                      const isSucc = l.level === "success";
                      return (
                        <div key={idx} className="flex gap-2 items-start hover:bg-slate-900/40 p-0.5 rounded transition">
                          <span className="text-slate-600 flex-shrink-0 select-none">[{l.timestamp}]</span>
                          <span className={`text-[10px] uppercase font-bold shrink-0 px-1 py-0.2 rounded ${
                            isErr ? "bg-rose-500/20 text-rose-300" : isWarn ? "bg-amber-500/20 text-amber-300" : isSucc ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                          }`}>{l.level}</span>
                          <span className={isErr ? "text-rose-400" : isWarn ? "text-amber-400" : isSucc ? "text-emerald-400" : "text-slate-300"}>{l.message}</span>
                        </div>
                      );
                    })
                )}
              </div>
            </section>
          )}
        </main>
      ) : currentView === "health" ? (
        /* DEDICATED HEALTH SCREEN (/health) */
        <main key="view-health" className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  System Health & Service Readiness
                  <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    /health
                  </span>
                </h1>
                <p className="text-sm text-slate-400">Live status of server, AI models, CoinMarketCap browser engine, cloud database, and alerts</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigateTo("admin", "diagnostics")}
                className="px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-sm"
                title="Open Playwright & Environment Diagnostics (/admin)"
              >
                <Shield className="h-4 w-4 text-blue-400" /> Runtime Diagnostics
              </button>
              <button onClick={() => navigateTo("dashboard")} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md">
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* Top Overall Status Banner */}
          {healthData?.overall === "ok" && healthData?.healthy !== false ? (
            <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Everything is working</h2>
                  <p className="text-sm text-slate-300">All core services, cloud database connections, and active account sessions are operational.</p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 self-start sm:self-auto">
                SYSTEM OPTIMAL
              </span>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="h-6 w-6 text-rose-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Needs attention</h2>
                  <p className="text-sm text-slate-300">One or more system checks require attention. Review the cards and messages below.</p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 self-start sm:self-auto">
                ACTION REQUIRED
              </span>
            </div>
          )}

          {/* 5 SERVICE HEALTH CARDS (Includes the 5 required chips + clear explanations & actions) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Server */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">1. Backend Runtime</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                    Server: <span className="font-semibold text-emerald-400">ONLINE</span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.server?.message || "Node.js Express backend server is online and handling automation requests."}
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
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">2. AI Comment Generator</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm">
                    <span className="text-slate-400 font-mono">OpenAI:</span>
                    {apiStatus.openai ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Enabled
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Rule-Based
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.openai?.message || "Generates tailored bullish/bearish crypto commentary using GPT-4o-mini."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Model: <strong className="text-slate-200 font-mono">{apiStatus.openai ? "gpt-4o-mini" : "Fallback"}</strong></span>
                <button onClick={() => navigateTo("admin", "secrets")} className="text-blue-400 hover:text-blue-300 font-bold cursor-pointer">
                  API Keys →
                </button>
              </div>
            </div>

            {/* 3. CMC & Browser */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">3. Market Data & Browser</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm">
                    <span className="text-slate-400 font-mono">CMC:</span>
                    {apiStatus.cmc ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Connected
                      </span>
                    ) : (
                      <span className="text-blue-400 font-bold flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5" /> CG Public
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.cmc?.message || "Playwright Chromium engine and CoinMarketCap market feed are ready."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Browser: <strong className="text-slate-200 font-mono">Playwright Chromium</strong></span>
                <button onClick={() => navigateTo("admin", "diagnostics")} className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer">
                  Verify Binary →
                </button>
              </div>
            </div>

            {/* 4. Cloud Database */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">4. Cloud Persistence</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-sm">
                    <span className="text-slate-400 font-mono">DB:</span>
                    {storageInfo.isFirebaseDisabled ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1" title="MongoDB Atlas Active. Zero Firebase calls.">
                        <Database className="h-3.5 w-3.5 text-emerald-400" /> Mongo (Quota Safe)
                      </span>
                    ) : storageInfo.isMongoConnected ? (
                      <span className="text-cyan-400 font-bold flex items-center gap-1" title="Dual Storage: Firebase + MongoDB">
                        <Database className="h-3.5 w-3.5 text-cyan-400" /> Mongo + Cloud
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold flex items-center gap-1" title="Firebase Default">
                        <Database className="h-3.5 w-3.5 text-amber-400" /> Firebase
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {healthData?.checks?.database?.message || "Account sessions, coins, comments, and scheduler progress are synced to the cloud."}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Active Account: <strong className="text-emerald-400 font-mono">{activeProfile?.name || "None"}</strong></span>
                <button
                  onClick={() => {
                    handleResetLoginState();
                    setLoginTab("credentials");
                    setShowSessionModal(true);
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                >
                  Accounts →
                </button>
              </div>
            </div>

            {/* 5. Notification Alerts Toggle */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col justify-between gap-4 md:col-span-2 lg:col-span-2">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">5. Toast & Emergency Notifications</span>
                  <button
                    onClick={toggleNotifications}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-bold transition duration-200 cursor-pointer ${
                      notificationsEnabled
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    }`}
                    title={notificationsEnabled ? "Notification toasts are active. Click to mute." : "Notification toasts are muted. Click to turn ON."}
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
                  Controls real-time in-app toast notifications when coins are fetched, comments are generated, or posts finish. Critical error alerts are also routed to Telegram if enabled in Admin.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Telegram Emergency Hotline: <strong className={telegramEnabled ? "text-emerald-400 font-mono" : "text-slate-400 font-mono"}>{telegramEnabled ? "ACTIVE" : "OFF"}</strong></span>
                <button onClick={() => navigateTo("admin", "telegram")} className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer">
                  Configure Telegram Hotline →
                </button>
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
      ) : (
        /* MAIN BOT DASHBOARD */
        <main key="view-dashboard" className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">

        {/* ROW 1: ACTIONS & ACTIVE PROGRESS */}
        <div className="dashboard-grid-row">
          
          {/* CONTROL PANEL CARD (7 cols) */}
          <section id="controls-panel" className="lg:col-span-7 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700/80 relative overflow-hidden group h-full">
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
                    <h2 className="font-bold text-white text-base tracking-tight flex items-center gap-1.5">
                      Control Center
                    </h2>
                    <p className="text-xs text-slate-400">Playwright Community Auto-Poster</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) {
                        showToast("Cannot reset storage while an active process is running. Please stop the active process first.", "warning");
                        return;
                      }
                      setInlineConfirmModal({
                        isOpen: true,
                        title: "Reset Active Account Queue",
                        message: "Clear queued trending coins, generated comments, and console logs for this account? Your posted submission history and cookies will remain safe.",
                        onConfirm: () => runCommand("/api/clear-all", "clear")
                      });
                    }}
                    disabled={isPending.clear || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                    className={`text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] px-2.5 py-1.5 rounded-xl border ${
                      (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning)
                        ? "bg-slate-950/60 text-slate-500 border-slate-800/80 opacity-50 cursor-not-allowed"
                        : "text-red-400/90 hover:text-red-300 bg-slate-950/80 hover:bg-red-500/10 border-slate-800 hover:border-red-500/20 cursor-pointer"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                    id="btn-clear-stats"
                    title={
                      (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning)
                        ? "Locked: Stop the active bot process before resetting storage"
                        : "Reset storage and clear local queue data"
                    }
                  >
                    {(isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) ? (
                      <>
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                        <span>Reset Locked</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{isPending.clear ? "Resetting..." : "Reset Storage"}</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 shadow-sm">
                    <span className={`w-2 h-2 rounded-full ${
                      status === "Posting" ? "bg-emerald-400 animate-ping" :
                      status === "Stopping" || isStoppingPost ? "bg-amber-400 animate-spin" :
                      status === "Generating" ? "bg-purple-400 animate-pulse" :
                      status === "Fetching" ? "bg-blue-400 animate-pulse" :
                      status === "Authenticating" ? "bg-amber-400 animate-pulse" :
                      (totalCoins > 0 && generatedCount > 0) ? "bg-emerald-400" : "bg-slate-500"
                    }`} />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                      {status === "Stopping" || isStoppingPost
                        ? "Stopping"
                        : status !== "Idle"
                          ? status
                          : (totalCoins > 0 && generatedCount > 0)
                            ? "Ready"
                            : "Standby"}
                    </span>
                  </div>
                </div>
              </div>

              {/* RUN MODE STRIP */}
              <div className="mb-4 px-3.5 py-2 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Engine: <strong className="text-white font-semibold">Real Browser (Headless Playwright)</strong>
                </span>
                <span className="text-slate-400 font-mono hidden sm:inline">
                  Account: <strong className="text-emerald-400">{activeProfile?.name || (sessionExists ? "Active" : "Not Logged In")}</strong>
                </span>
              </div>

              {/* ACTIVE PROCESS MUTEX BANNER */}
              {activeProcess && activeProcess !== "none" && (
                <div className="mb-3 px-3.5 py-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-between text-sm text-indigo-300 shadow-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
                    <span className="truncate text-xs">
                      <strong className="text-white font-semibold">Process Active:</strong> {activeProcessDescription || activeProcess} (Other actions safely locked)
                    </span>
                  </div>
                  <span className="text-xs font-mono uppercase bg-indigo-500/20 px-2 py-0.5 rounded font-bold border border-indigo-500/30 shrink-0">
                    Locked
                  </span>
                </div>
              )}

              {/* 2x2 MODERN ACTION DECK - STABILIZED GRID WITH REAL STATUS BADGES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {/* 1. Check login */}
                <button
                  onClick={() => runCommand("/api/check-login", "login")}
                  disabled={isPending.login || isBusy || isContinuousLoopActive}
                  className="action-grid-btn min-h-[76px] h-full p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-login"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500/20 border border-emerald-500/20 transition">
                      <CheckCircle className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition">1. Check login</h3>
                      <p className="text-xs text-slate-400">Verify browser session</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border font-semibold ${
                      isPending.login || status === "Authenticating"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : sessionExists
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    }`}>
                      {isPending.login || status === "Authenticating"
                        ? "Verifying..."
                        : sessionExists
                          ? "Verified"
                          : "Login Needed"}
                    </span>
                    {isPending.login ? (
                      <RefreshCw className="h-3.5 w-3.5 text-emerald-400 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition" />
                    )}
                  </div>
                </button>

                {/* 2. Get trending coins */}
                <button
                  onClick={async () => {
                    if (coinsList.length > 0) {
                      setShowConfirmFetchModal(true);
                    } else {
                      await runCommand("/api/fetch-trending", "fetch");
                    }
                  }}
                  disabled={isPending.fetch || isPending.clear || isBusy || isContinuousLoopActive}
                  className="action-grid-btn min-h-[76px] h-full p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-fetch"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20 border border-blue-500/20 transition">
                      <Search className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition">2. Get trending coins</h3>
                      <p className="text-xs text-slate-400">Load live market list</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border font-semibold ${
                      isPending.fetch || status === "Fetching"
                        ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        : totalCoins > 0
                          ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                    }`} title={coinsFetchedAt ? `Fetched: ${formatTimeAgo(coinsFetchedAt).full}` : undefined}>
                      {isPending.fetch || status === "Fetching"
                        ? "Fetching..."
                        : totalCoins > 0
                          ? `${totalCoins} Coins${coinsFetchedAt ? ` • ${formatTimeAgo(coinsFetchedAt).text}` : ""}`
                          : "0 Coins"}
                    </span>
                    {isPending.fetch ? (
                      <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition" />
                    )}
                  </div>
                </button>

                {/* 3. Write comments */}
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
                  className="action-grid-btn min-h-[76px] h-full p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
                  id="btn-generate"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover:bg-purple-500/20 border border-purple-500/20 transition">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition">3. Write comments</h3>
                      <p className="text-xs text-slate-400">AI gpt-4o-mini</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border font-semibold ${
                      isPending.generate || status === "Generating"
                        ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                        : generatedCount > 0
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                    }`} title={commentsGeneratedAt ? `Generated: ${formatTimeAgo(commentsGeneratedAt).full}` : undefined}>
                      {isPending.generate || status === "Generating"
                        ? "Writing..."
                        : generatedCount > 0
                          ? `${generatedCount} Ready${commentsGeneratedAt ? ` • ${formatTimeAgo(commentsGeneratedAt).text}` : ""}`
                          : "0 Comments"}
                    </span>
                    {isPending.generate ? (
                      <RefreshCw className="h-3.5 w-3.5 text-purple-400 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition" />
                    )}
                  </div>
                </button>

                {/* 4. Start / Stop Posting */}
                {(status === "Posting" || status === "Stopping" || isContinuousLoopActive || isStoppingPost) ? (
                  <button
                    onClick={() => {
                      setIsStoppingPost(true);
                      runCommand("/api/stop-posting", "post");
                    }}
                    disabled={isPending.post}
                    className="action-grid-btn min-h-[76px] h-full p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
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
                        <h3 className="text-sm font-bold text-white">
                          {(isStoppingPost || status === "Stopping") ? "Stopping Posting..." : "4. Stop Posting"}
                        </h3>
                        <p className="text-xs text-rose-300/80">
                          {(isStoppingPost || status === "Stopping") ? "Finishing current coin • Click to force stop" : "Halt active posting sequence"}
                        </p>
                      </div>
                    </div>
                    {(isStoppingPost || status === "Stopping" || isPending.post) ? (
                      <span className="text-xs font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/30 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Stopping
                      </span>
                    ) : (
                      <span className="text-xs font-mono uppercase bg-rose-500/20 px-2 py-0.5 rounded-full font-bold border border-rose-500/30">Posting</span>
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
                      // Check if data is older than 2 days
                      if (isDataOlderThan2Days()) {
                        setShowStaleWarningModal(true);
                        return;
                      }
                      setIsStartingPost(true);
                      await runCommand("/api/post-chat", "post");
                    }}
                    disabled={isPending.post || isStartingPost || isBusy || isContinuousLoopActive}
                    className="action-grid-btn min-h-[76px] h-full p-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-left flex items-center justify-between group disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer shadow-sm"
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
                        <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition">
                          {isStartingPost ? "Starting Browser..." : "4. Start Posting"}
                        </h3>
                        <p className="text-xs text-slate-400">Submit comments with Playwright</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full border font-semibold ${
                        totalCoins > 0 && generatedCount > 0
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {isStartingPost || isPending.post
                          ? "Starting..."
                          : totalCoins > 0 && generatedCount > 0
                            ? `Ready (${Math.max(0, generatedCount - Math.min(progressIndex, generatedCount))})`
                            : "Need Queue"}
                      </span>
                      {isStartingPost || isPending.post ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition" />
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Dedicated Stale Market Data Warning Banner Row (Eliminates Action Deck Bounciness) */}
              {isDataOlderThan2Days() && status !== "Posting" && status !== "Stopping" && !isContinuousLoopActive && (
                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-sm text-amber-300 shadow-sm animate-fadeIn">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-sm block text-amber-200">Market Data Over 2 Days Old</span>
                      <span className="text-[11px] text-amber-400/80 block truncate">
                        Cryptocurrency prices shift rapidly. Recommend refreshing trending coins and comments before posting.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRefreshFreshData(false)}
                    disabled={isRefreshingFreshData || isBusy}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-sm transition shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isRefreshingFreshData ? "Refreshing..." : "Refresh Now"}
                  </button>
                </div>
              )}
            </div>

            {/* FULL AUTOMATION SEQUENCE & CONTINUOUS LOOP */}
            <div className="mt-4 pt-3 flex flex-col gap-3 relative z-10">
              <button
                onClick={() => runCommand("/api/full-flow", "full", { continuous: isContinuousLoopActive, intervalMinutes: continuousInterval })}
                disabled={isPending.full || isBusy || isContinuousLoopActive || isSchedulerRunning}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 transition-all duration-150 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-[0.98] flex items-center justify-center gap-2 font-black text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                id="btn-full-flow"
                title={
                  (isBusy || isContinuousLoopActive || isSchedulerRunning)
                    ? "Locked while another bot or scheduler process is active"
                    : "Fetch trending coins, write AI comments, and post automatically in 1 click"
                }
              >
                {isPending.full ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Running Full Automated Cycle...</span>
                  </>
                ) : (isBusy || isContinuousLoopActive || isSchedulerRunning) ? (
                  <>
                    <Lock className="h-4 w-4 text-slate-950" />
                    <span>Run Full Automated Bot Cycle (Process Active)</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-slate-950" />
                    <span>Run Full Automated Bot Cycle</span>
                  </>
                )}
              </button>

              {/* CONTINUOUS LOOP REFINED CONTROLLER - PROMINENT & EASILY DETECTABLE */}
              <div className={`p-3.5 rounded-xl border flex flex-col gap-3 shadow-inner transition-all duration-150 ${
                isContinuousLoopActive
                  ? "bg-emerald-950/30 border-emerald-500/40"
                  : "bg-slate-950/60 border-slate-800/60"
              }`}>
                {isSchedulerRunning && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium">
                    Settings are locked while the scheduler is running. Pause or stop to change them.
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      isContinuousLoopActive ? "bg-emerald-400 animate-ping" : "bg-slate-500"
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-200">
                          Continuous Automation Loop
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                          isContinuousLoopActive
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-900 text-slate-400 border-slate-800"
                        }`}>
                          {isContinuousLoopActive ? `ACTIVE • ${continuousInterval}m GAP` : "OFF"}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 block">
                        Auto-restarts full posting cycle after cooldown gap
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="chk-continuous"
                    disabled={(isBusy && !isContinuousLoopActive) || isSchedulerRunning}
                    onClick={() => toggleContinuousLoop(!isContinuousLoopActive, continuousInterval)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
                      isContinuousLoopActive
                        ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40"
                        : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                    }`}
                  >
                    {isContinuousLoopActive ? (
                      <>
                        <Square className="h-3.5 w-3.5" />
                        <span>Stop Auto-Loop</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-slate-950" />
                        <span>Enable Auto-Loop</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Interval slider & Quick preset buttons */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-medium">Wait between rounds:</span>
                    <div className="flex items-center gap-1.5">
                      {[5, 15, 30, 60].map((preset) => (
                        <button
                          key={preset}
                          disabled={isContinuousLoopActive || isSchedulerRunning}
                          onClick={() => {
                            setContinuousInterval(preset);
                            saveIntervalToServer(preset);
                          }}
                          className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                            continuousInterval === preset
                              ? "bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20"
                              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80"
                          } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
                        >
                          {preset}m
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min="5"
                      max="120"
                      disabled={isContinuousLoopActive || isSchedulerRunning}
                      value={continuousInterval}
                      onChange={(e) => setContinuousInterval(Math.max(5, Number(e.target.value)))}
                      onMouseUp={() => saveIntervalToServer(continuousInterval)}
                      onTouchEnd={() => saveIntervalToServer(continuousInterval)}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      id="slider-interval"
                      title="Adjust cooldown gap between automated cycles (min: 5m)"
                    />
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      disabled={isContinuousLoopActive || isSchedulerRunning}
                      value={continuousInterval}
                      onChange={(e) => {
                        const val = Math.max(5, Number(e.target.value));
                        setContinuousInterval(val);
                        saveIntervalToServer(val);
                      }}
                      className="w-12 bg-slate-900 border border-slate-800/80 rounded-lg px-1.5 py-0.5 text-center text-[10px] font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50 shadow-inner disabled:opacity-40 disabled:cursor-not-allowed"
                      id="num-interval"
                      title="Cooldown minutes between automated cycles (min: 5m)"
                    />
                  </div>
                </div>

                {/* Isolated Countdown Component that never causes main App re-render lag */}
                {isContinuousLoopActive && (
                  <CycleCountdown nextCycleStartTime={nextCycleStartTime} />
                )}
              </div>

              {/* MARKETING IMAGE ATTACHMENT CARD (ORDERED & UN-STUFFED) */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-indigo-500/30 flex flex-col gap-3 shadow-inner">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`p-2 rounded-lg border ${imageUploadEnabled ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" : "bg-slate-900 text-slate-400 border-slate-800"}`}>
                      <ImageIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          Marketing Image Upload
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${imageUploadEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                          {imageUploadEnabled ? `ACTIVE • ${marketingImages.length} Ready` : 'PAUSED • Text-Only'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        {imageUploadEnabled
                          ? `Attaches 1 graphic per comment (${imageSelectionMode === "cycle" ? "Sequential Cycle" : "Random Shuffle"} • Next #${((activeImageIndex % Math.max(1, marketingImages.length)) + 1)})`
                          : "Currently paused — comments will be posted as text-only"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleImageUpload(!imageUploadEnabled)}
                    disabled={isUpdatingImageSettings}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                      imageUploadEnabled
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
                    }`}
                    id="chk-image-upload"
                  >
                    {imageUploadEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    <span>{imageUploadEnabled ? "Pause Images" : "Enable Images"}</span>
                  </button>
                </div>

                {/* Ordered 3-Step Image Action Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => imageFileInputRef.current?.click()}
                    disabled={isUploadingImages}
                    className="py-2 px-3 bg-emerald-600/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isUploadingImages ? "Uploading..." : "1. Upload Images"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExternalImportModalOpen(true)}
                    className="py-2 px-3 bg-teal-600/15 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>2. Import Drive / S3</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("images");
                      document.getElementById("storage-explorer")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="py-2 px-3 bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>3. Image Library ({marketingImages.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ACTIVE PROGRESS / EXECUTION MONITOR (5 cols) */}
          <section className="lg:col-span-5 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700/80 relative overflow-hidden group h-full">
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
                    <h2 className="font-bold text-white text-base tracking-tight">Progress</h2>
                    <p className="text-xs text-slate-400">Live Post & Batch Metrics</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1 rounded-xl border border-slate-800 shadow-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    status === "Stopping" || isStoppingPost ? "bg-amber-400 animate-spin" :
                    status !== "Idle" ? "bg-emerald-400 animate-pulse" :
                    (totalCoins > 0 && generatedCount > 0) ? "bg-emerald-400" : "bg-slate-500"
                  }`} />
                  <span className="text-xs font-mono text-slate-200 font-semibold uppercase">
                    {status === "Stopping" || isStoppingPost
                      ? "Halting"
                      : status !== "Idle"
                        ? status
                        : (totalCoins > 0 && generatedCount > 0)
                          ? "Queue Ready"
                          : "Standby"}
                  </span>
                </div>
              </div>

              {/* CURRENT COIN SPOTLIGHT CARD */}
              {(() => {
                const activePid = activeProfileIdRef.current || activeProfile?.id;
                const profileResults = results.filter(r => !activePid || !r.profileId || r.profileId === activePid);
                const batchGenTime = commentsGeneratedAt || 0;
                const isCurBatchResult = (r: PostResult) => {
                  if (!batchGenTime) return true;
                  const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
                  return !isNaN(rTime) && rTime >= (batchGenTime - 120000);
                };
                const curBatchResults = profileResults.filter(isCurBatchResult);
                const verifiedBatchSuccessCount = curBatchResults.filter(r => r.status === "success").length;
                const verifiedBatchFailedCount = curBatchResults.filter(r => r.status !== "success" && r.status !== "skipped").length;

                const activeBatchTotal = generatedCount > 0 ? generatedCount : (totalCoins > 0 ? totalCoins : 0);
                // Use verified successful posts for the current batch when results are loaded; never fake 100% when coins failed
                const displayPostedCount = curBatchResults.length > 0 ? verifiedBatchSuccessCount : postedCount;
                const displayFailedCount = curBatchResults.length > 0 ? verifiedBatchFailedCount : failedCount;
                const clampedProgress = Math.min(
                  curBatchResults.length > 0 ? verifiedBatchSuccessCount : progressIndex,
                  activeBatchTotal
                );
                const batchPercent = activeBatchTotal > 0 ? Math.min(100, Math.max(0, Math.round((clampedProgress / activeBatchTotal) * 100))) : 0;
                const remainingBatch = Math.max(0, activeBatchTotal - clampedProgress);
                const nextQueuedSymbol = coinsList[Math.min(progressIndex, Math.max(0, activeBatchTotal - 1))]?.symbol || messagesList[Math.min(progressIndex, Math.max(0, activeBatchTotal - 1))]?.symbol;

                return (
                  <>
                    <div className="spotlight-asset-card min-h-[86px] p-4 bg-slate-950/80 rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-between shadow-inner">
                      <div className="space-y-1">
                        <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block font-bold">Target Asset & Queue State</span>
                        <div className="text-lg font-black text-white font-mono tracking-tight flex items-center gap-2 flex-wrap">
                          {status === "Stopping" || isStoppingPost ? (
                            <span className="text-amber-400 flex items-center gap-1.5 text-base font-bold">
                              <RefreshCw className="h-4 w-4 animate-spin" /> Stopping Engine...
                            </span>
                          ) : isStartingPost ? (
                            <span className="text-emerald-400 flex items-center gap-1.5 text-base font-bold">
                              <RefreshCw className="h-4 w-4 animate-spin" /> Starting Engine...
                            </span>
                          ) : status === "Fetching" ? (
                            <span className="text-blue-400 flex items-center gap-1.5 text-base font-bold">
                              <RefreshCw className="h-4 w-4 animate-spin" /> Fetching Coins...
                            </span>
                          ) : status === "Generating" ? (
                            <span className="text-purple-400 flex items-center gap-1.5 text-base font-bold">
                              <RefreshCw className="h-4 w-4 animate-spin" /> Writing AI Comments...
                            </span>
                          ) : currentCoin !== "N/A" ? (
                            currentCoin
                          ) : activeBatchTotal > 0 && clampedProgress >= activeBatchTotal ? (
                            <span className="text-emerald-400 text-base font-bold">Batch Complete ({clampedProgress}/{activeBatchTotal} Verified)</span>
                          ) : activeBatchTotal > 0 && progressIndex >= activeBatchTotal && remainingBatch > 0 ? (
                            <span className="text-amber-400 text-base font-bold">Run Finished ({clampedProgress}/{activeBatchTotal} Posted • {remainingBatch} Unposted)</span>
                          ) : nextQueuedSymbol ? (
                            <span className="text-emerald-300 text-base font-bold">Next: ${nextQueuedSymbol}</span>
                          ) : activeBatchTotal > 0 ? (
                            <span className="text-emerald-300 text-base font-bold">Ready ({remainingBatch} Queued)</span>
                          ) : (
                            <span className="text-slate-400 text-base font-bold">Queue Empty</span>
                          )}
                          {status === "Posting" && currentCoin !== "N/A" && (
                            <span className="text-xs font-sans font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                              In Progress
                            </span>
                          )}
                          {(status === "Stopping" || isStoppingPost) && (
                            <span className="text-xs font-sans font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                              Halting Step
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 font-mono block">
                          {status === "Stopping" || isStoppingPost
                            ? "Gracefully finishing current coin before stopping..."
                            : isStartingPost
                            ? "Launching Playwright Chromium browser..."
                            : status === "Posting"
                            ? `Posting coin #${Math.min(progressIndex + 1, activeBatchTotal || 1)} of ${activeBatchTotal || 0} (${clampedProgress} verified on CMC)`
                            : activeBatchTotal > 0 && clampedProgress >= activeBatchTotal
                            ? `All ${activeBatchTotal} items verified posted on CoinMarketCap`
                            : activeBatchTotal > 0 && progressIndex >= activeBatchTotal && remainingBatch > 0
                            ? `${clampedProgress} verified posted, ${displayFailedCount} failed/rate-limited (${remainingBatch} not posted on CMC)`
                            : progressIndex > 0 && activeBatchTotal > 0
                            ? `Paused at #${progressIndex} of ${activeBatchTotal} (${clampedProgress} verified posted, ${remainingBatch} remaining)`
                            : activeBatchTotal > 0
                            ? `${activeBatchTotal} items loaded & synced with cloud storage`
                            : "Click 'Get trending coins' to load your first batch"}
                        </span>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <div className="text-3xl font-black font-mono tabular-nums text-emerald-400 tracking-tight">
                          {batchPercent}%
                        </div>
                        <span className="text-xs text-slate-400 font-mono uppercase font-semibold">Verified</span>
                      </div>
                    </div>

                    {/* 5-METRIC KPI GRID - STABILIZED HEIGHTS */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-stretch">
                      <div className="kpi-stat-box min-h-[74px] p-3 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                        <span className="text-xs font-mono text-slate-400 uppercase block font-semibold">Total Coins</span>
                        <div className="text-lg font-black text-slate-100 font-mono tabular-nums mt-0.5">{totalCoins}</div>
                      </div>

                      <div className="kpi-stat-box min-h-[74px] p-3 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                        <span className="text-xs font-mono text-slate-400 uppercase block font-semibold">Comments AI</span>
                        <div className="text-lg font-black text-purple-400 font-mono tabular-nums mt-0.5">{generatedCount}</div>
                      </div>

                      <div className="kpi-stat-box min-h-[74px] p-3 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-slate-400 uppercase block font-semibold">Verified Posted</span>
                          {displayFailedCount > 0 && (
                            <span className="text-[11px] font-mono text-rose-400 font-bold" title="Coins that failed or were rate-limited on CoinMarketCap">
                              {displayFailedCount} Failed
                            </span>
                          )}
                        </div>
                        <div className="text-lg font-black text-emerald-400 font-mono tabular-nums mt-0.5">{displayPostedCount}</div>
                      </div>

                      <div className="kpi-stat-box min-h-[74px] p-3 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
                        <span className="text-xs font-mono text-slate-400 uppercase block font-semibold">Unposted / Left</span>
                        <div className="text-lg font-black text-amber-400 font-mono tabular-nums mt-0.5">{remainingBatch}</div>
                      </div>

                      <div 
                        className="kpi-stat-box min-h-[74px] p-3 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition col-span-2 sm:col-span-1 flex flex-col justify-between"
                        title="Daily safety cap resets automatically every day at 00:00 UTC"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-slate-400 uppercase block font-semibold">Daily Posts</span>
                          <span className="text-xs font-mono text-slate-400 font-bold" title="Resets every calendar day">Cap {dailyPostLimit}</span>
                        </div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className={`text-lg font-black font-mono tabular-nums ${dailyPostCount >= dailyPostLimit ? "text-rose-400" : "text-emerald-400"}`}>
                            {dailyPostCount}
                          </span>
                          <span className="text-sm text-slate-400 font-mono tabular-nums">/ {dailyPostLimit}</span>
                        </div>
                      </div>
                    </div>

                    {totalCoins > 0 && generatedCount > 0 && totalCoins !== generatedCount && (
                      <div className="p-2.5 bg-indigo-950/40 border border-indigo-800/40 rounded-xl flex items-center justify-between text-[11px] font-mono text-indigo-300">
                        <span>Notice: Queue has {generatedCount} comments vs {totalCoins} current coins in list.</span>
                        <button
                          onClick={() => setShowConfirmGenerateModal(true)}
                          disabled={isPending.generate || isBusy}
                          className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 text-[10px] font-bold transition cursor-pointer"
                        >
                          Sync Comments
                        </button>
                      </div>
                    )}

                    {dailyPostCount >= dailyPostLimit && (
                      <div className="mt-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-sm font-semibold">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 animate-pulse text-rose-400" />
                        <span>Account reached daily posting limit ({dailyPostCount}/{dailyPostLimit} posts today). Automated posting is halted until tomorrow.</span>
                      </div>
                    )}

                    {/* BATCH PROGRESS BAR */}
                    <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2 relative z-10">
                      <div className="flex justify-between items-center text-sm font-mono">
                        <span className="text-slate-400 text-[11px]">Batch Progress Track</span>
                        <span className="text-emerald-400 font-bold text-[11px] font-mono">
                          {clampedProgress} / {activeBatchTotal} {generatedCount > 0 && generatedCount !== totalCoins ? "comments" : "coins"}
                        </span>
                      </div>

                      {/* Glowing High-Tech Neon Progress Bar */}
                      <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                        <div
                          className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out shadow-sm shadow-emerald-500/30"
                          style={{ width: `${batchPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="flex justify-between items-center text-xs font-mono text-slate-400 pt-0.5">
                <span>Success Rate: <strong className="text-slate-200 font-semibold">{postedCount + failedCount > 0 ? Math.round((postedCount / (postedCount + failedCount)) * 100) : 100}%</strong></span>
                <span>Active Profile: <strong className="text-emerald-400 font-semibold">{activeProfile?.name || "Active"}</strong></span>
              </div>
            </div>
          </section>

        </div>

        {/* ROW 3: STORAGE AND REPORTS DATA EXPLORER (Full width) */}
        <section id="storage-explorer" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                <Database className="h-5 w-5" />
              </span>
              Storage & Report Explorer
            </h2>

            {/* Exporter selector tabs + Unified Refresh Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab("coins")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                    activeTab === "coins" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  1. Trending Coins ({coinsList.length})
                </button>
                <button
                  onClick={() => setActiveTab("comments")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                    activeTab === "comments" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  2. Generated Comments ({messagesList.length})
                </button>
                <button
                  onClick={() => setActiveTab("results")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                    activeTab === "results" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {(() => {
                    const activePid = activeProfileIdRef.current || activeProfile?.id;
                    const count = results.filter(r => !activePid || !r.profileId || r.profileId === activePid).length;
                    return `3. Post Submissions (${count})`;
                  })()}
                </button>
                <button
                  onClick={() => setActiveTab("reports")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all cursor-pointer ${
                    activeTab === "reports" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  4. CSV Exports & Reports
                </button>
                <button
                  onClick={() => setActiveTab("images")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "images" ? "bg-indigo-600/50 text-white border border-indigo-500/50 shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
                  <span>5. Images Library ({marketingImages.length})</span>
                  <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${imageUploadEnabled ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                    {imageUploadEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <button
                onClick={handleManualRefresh}
                disabled={isRefreshingData}
                className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-sm font-bold border border-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer"
                title="Refresh trending coins, generated comments, and submission results"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingData ? "animate-spin" : ""}`} />
                <span>Refresh Data</span>
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
                    <span className="text-sm text-slate-400 font-mono">
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
                      }`} title={coinsFetchedAt ? `Exact fetch time: ${formatTimeAgo(coinsFetchedAt).full}` : "Coins loaded from previous session. Click Get trending coins to get fresh coins with live timer."}>
                        <Clock className="h-3 w-3" />
                        {coinsFetchedAt 
                          ? `Fetched: ${formatTimeAgo(coinsFetchedAt).text} (${formatTimeAgo(coinsFetchedAt).full})`
                          : "Fetched: Previous Session (Click Get trending coins to update)"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                  <table className="w-full text-left text-sm border border-slate-700/80 border-collapse min-w-[900px]">
                    <thead className="bg-slate-950 text-slate-300 uppercase text-xs tracking-wider border-b border-slate-700/80 font-mono font-bold">
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
                                If you recently switched profiles, the browser data might not have synchronized yet. Click <strong>"Refresh Coins"</strong> above, or trigger <strong>"Get trending coins"</strong> in the Control Center to populate.
                              </p>
                              <button
                                onClick={handleManualRefresh}
                                disabled={isRefreshingData}
                                className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm transition inline-flex items-center gap-1.5 cursor-pointer"
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
            {activeTab === "comments" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm text-slate-400 font-mono">
                      Showing {messagesList.length} AI-generated comments for the active profile
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
                      }`} title={commentsGeneratedAt ? `Exact generation time: ${formatTimeAgo(commentsGeneratedAt).full}` : "Comments loaded from previous session. Click Write comments to generate fresh commentary with live timer."}>
                        <Clock className="h-3 w-3" />
                        {commentsGeneratedAt 
                          ? `Generated: ${formatTimeAgo(commentsGeneratedAt).text} (${formatTimeAgo(commentsGeneratedAt).full})`
                          : "Generated: Previous Session (Click Write comments to update)"}
                      </span>
                    )}
                  </div>
                </div>

                {messagesList.length === 0 ? (
                  <div className="p-12 bg-slate-950/60 border border-slate-800 rounded-2xl text-center text-slate-400 space-y-3">
                    <div className="text-slate-500 font-medium">No generated comments found in storage for this profile.</div>
                    <div className="text-sm text-slate-400 max-w-md mx-auto">
                      Comments must be generated before they can be posted. Click <strong className="text-emerald-400">"Refresh Data"</strong> above, or trigger <strong className="text-purple-400">"Write comments"</strong> in the Control Center.
                    </div>
                    <button
                      onClick={handleManualRefresh}
                      disabled={isRefreshingData}
                      className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                      Refresh Now
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                    <table className="w-full text-left text-sm border border-slate-700/80 border-collapse min-w-[750px]">
                      <thead className="bg-slate-950 text-slate-300 uppercase text-xs tracking-wider border-b border-slate-700/80 font-mono font-bold">
                        <tr>
                          <th className="py-3 px-4 w-[100px] border-r border-slate-700/80 whitespace-nowrap">Sequence</th>
                          <th className="py-3 px-4 w-[160px] border-r border-slate-700/80 whitespace-nowrap">Asset</th>
                          <th className="py-3 px-4 w-[120px] border-r border-slate-700/80 whitespace-nowrap">Sentiment</th>
                          <th className="py-3 px-4 border-r border-slate-700/80 whitespace-nowrap">Generated Comment Message</th>
                          <th className="py-3 px-4 text-right w-[130px] whitespace-nowrap">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                        {messagesList.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                            <td className="py-3.5 px-4 font-mono border-r border-slate-800/80">
                              <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 font-bold">
                                #{index + 1}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-white border-r border-slate-800/80">
                              <div className="leading-none">{item.name}</div>
                              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{item.symbol}</span>
                            </td>
                            <td className="py-3.5 px-4 border-r border-slate-800/80">
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
                            <td className="py-3.5 px-4 font-mono text-slate-300 leading-relaxed italic border-r border-slate-800/80">
                              "{item.message}"
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-400 hover:text-purple-300 hover:underline inline-flex items-center gap-1 font-semibold"
                              >
                                Open <ChevronRight className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SUBMISSION RESULTS */}
            {activeTab === "results" && (() => {
              const activePid = activeProfileIdRef.current || activeProfile?.id;
              const profileResults = results.filter(r => !activePid || !r.profileId || r.profileId === activePid);
              const batchGenTime = commentsGeneratedAt || 0;
              
              const isCurrentBatchResult = (r: PostResult) => {
                if (!batchGenTime) return true;
                const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
                return !isNaN(rTime) && rTime >= (batchGenTime - 120000);
              };

              const currentBatchResults = profileResults.filter(isCurrentBatchResult);
              const matchSymbol = (a?: string, b?: string) => String(a || "").replace(/^\$/, "").trim().toLowerCase() === String(b || "").replace(/^\$/, "").trim().toLowerCase();
              const pendingItems = messagesList.filter(msgItem => !currentBatchResults.some(r => matchSymbol(r.symbol, msgItem.symbol) && r.status === "success"));
              const batchPostedCount = currentBatchResults.filter(r => r.status === "success").length;

              return (
                <div className="space-y-4">
                  {/* Top Bar with Mode Switcher & Actions */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
                        <button
                          onClick={() => setSubmissionsViewMode("current_batch")}
                          className={`px-3 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            submissionsViewMode === "current_batch"
                              ? "bg-emerald-500 text-slate-950 shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Current Cycle Queue ({batchPostedCount}/{messagesList.length})
                        </button>
                        <button
                          onClick={() => setSubmissionsViewMode("all_history")}
                          className={`px-3 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            submissionsViewMode === "all_history"
                              ? "bg-blue-500 text-slate-950 shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          All History ({profileResults.length})
                        </button>
                      </div>
                      <span className="hidden sm:inline-block text-[11px] font-mono text-slate-400 ml-2">
                        {submissionsViewMode === "current_batch" 
                          ? `${pendingItems.length} pending in current cycle`
                          : `Total lifetime submissions log`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowRetentionSettingsModal(true)}
                        className="py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-bold border border-indigo-500/20 flex items-center gap-1.5 transition duration-200 cursor-pointer"
                        title="Configure automatic data retention and completed batch auto-pruning"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Retention & Prune ({retentionDays}d)
                      </button>
                      <button
                        onClick={() => setShowResetQueueConfirm(true)}
                        disabled={isResettingDailyQueue || profileResults.length === 0 || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-bold border border-indigo-500/20 flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer"
                        title={
                          (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning)
                            ? "Locked: Stop the active bot process before archiving or resetting the queue"
                            : "Archive completed submissions into 7-day database and restart queue from Coin #1 (accounts and cookies preserved)"
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Archive & Restart ({profileResults.length})
                      </button>
                    </div>
                  </div>

                  {/* Automated Background Isolation & Compaction Notice Banner */}
                  <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5 text-blue-300">
                      <span className="p-1 bg-blue-500/20 rounded-md text-blue-400 font-bold whitespace-nowrap">⚡ AUTO-COMPACTION</span>
                      <p className="text-[11px] leading-relaxed">
                        <strong>Automated Data Lifecycle Active:</strong> Completed batches and records older than {retentionDays} days are automatically archived to keep queue files lean and maintain peak bot speed. Unattended 24/7 background scheduler runs with zero bloat and never repeats finished coins.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md bg-slate-950/70">
                    <table className="w-full text-left text-sm border border-slate-700/80 border-collapse min-w-[850px]">
                      <thead className="bg-slate-950 text-slate-300 uppercase text-xs tracking-wider border-b border-slate-700/80 font-mono font-bold">
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
                        {submissionsViewMode === "all_history" ? (
                          // VIEW MODE: ALL LIFETIME HISTORY
                          profileResults.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 px-4 text-center text-slate-400">
                                <p className="text-slate-500 font-medium">No historical submission records found.</p>
                              </td>
                            </tr>
                          ) : (
                            [...profileResults].reverse().map((histItem, hIdx) => (
                              <tr key={hIdx} className="hover:bg-slate-800/40 transition-colors even:bg-slate-900/30 odd:bg-slate-950/40">
                                <td className="py-3 px-4 font-mono text-slate-400 border-r border-slate-800/80 whitespace-nowrap">
                                  {histItem.timestamp || "N/A"}
                                </td>
                                <td className="py-3 px-4 border-r border-slate-800/80">
                                  <div className="font-bold text-white leading-none">{histItem.name}</div>
                                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{histItem.symbol}</span>
                                </td>
                                <td className="py-3 px-4 font-bold border-r border-slate-800/80">
                                  {(histItem.sentiment || "bullish") === "bearish" ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                                      Bearish
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                      Bullish
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-semibold border-r border-slate-800/80">
                                  {histItem.status === "success" ? (
                                    <span className="text-emerald-400 flex items-center gap-1 font-bold">
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Post Submitted
                                    </span>
                                  ) : histItem.status === "skipped" ? (
                                    <span className="text-slate-400 flex items-center gap-1 font-bold">
                                      <AlertTriangle className="h-3.5 w-3.5 text-slate-400" /> Skipped (DEX)
                                    </span>
                                  ) : histItem.status === "captcha" ? (
                                    <span className="text-amber-400 flex items-center gap-1 font-bold">
                                      <AlertTriangle className="h-3.5 w-3.5 animate-bounce text-amber-400" /> Captcha
                                    </span>
                                  ) : (
                                    <span className="text-red-400 flex items-center gap-1 font-bold">
                                      <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> {histItem.status.toUpperCase()}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-slate-300 font-mono text-[11px] max-w-xs truncate border-r border-slate-800/80" title={histItem.message}>
                                  {histItem.message}
                                </td>
                                <td className="py-3 px-4 text-center border-r border-slate-800/80">
                                  <span className="text-slate-600 font-mono text-[11px]">—</span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <a
                                    href={histItem.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-semibold"
                                  >
                                    Verify <ChevronRight className="h-3 w-3" />
                                  </a>
                                </td>
                              </tr>
                            ))
                          )
                        ) : (
                          // VIEW MODE: CURRENT BATCH QUEUE
                          messagesList.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 px-4 text-center text-slate-400">
                                <div className="space-y-3 max-w-md mx-auto">
                                  <p className="text-slate-500 font-medium">No generated comments loaded for the current cycle.</p>
                                  <p className="text-[11px] text-slate-400">
                                    Click <strong>"Refresh"</strong> above, or trigger <strong>"Write comments"</strong> in the Control Center to populate the queue.
                                  </p>
                                  <button
                                    onClick={handleManualRefresh}
                                    disabled={isRefreshingData}
                                    className="mt-2 py-1.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <RefreshCw className={`h-3 w-3 ${isRefreshingData ? "animate-spin" : ""}`} />
                                    Refresh Now
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            messagesList.map((msgItem, index) => {
                              const item = [...currentBatchResults].reverse().find(r => matchSymbol(r.symbol, msgItem.symbol));
                              const pendingIndex = pendingItems.findIndex(p => matchSymbol(p.symbol, msgItem.symbol));
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
                                      isPostingActive ? (
                                        <span className="text-cyan-400 flex items-center gap-1.5 font-medium font-mono">
                                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                                          In Queue {seqStr && <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800 font-bold ml-1">{seqStr}</span>}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 flex items-center gap-1.5 font-medium font-mono">
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                                          Pending Run {seqStr && <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 font-bold ml-1">{seqStr}</span>}
                                        </span>
                                      )
                                    ) : item.status === "skipped" ? (
                                      <span className="text-slate-400 flex items-center gap-1 font-bold">
                                        <AlertTriangle className="h-3.5 w-3.5 text-slate-400" /> Skipped (DEX)
                                      </span>
                                    ) : item.status === "success" ? (
                                      <span className="text-emerald-400 flex items-center gap-1 font-bold">
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Post Submitted
                                      </span>
                                    ) : item.status === "captcha" ? (
                                      <span className="text-amber-400 flex items-center gap-1 font-bold">
                                        <AlertTriangle className="h-3.5 w-3.5 animate-bounce text-amber-400" /> Captcha Detected
                                      </span>
                                    ) : item.status === "expired" ? (
                                      <span className="text-rose-400 flex items-center gap-1 font-bold" title="Account session expired: CoinMarketCap displayed Log In">
                                        <AlertTriangle className="h-3.5 w-3.5 text-rose-400" /> Login expired — please log in again
                                      </span>
                                    ) : (
                                      <span className="text-red-400 flex items-center gap-1 font-bold">
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> {item.status.toUpperCase()}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px] max-w-xs truncate border-r border-slate-800/80" title={item ? item.message : msgItem.message}>
                                    {item ? (
                                      item.message === "Post button text is Log In" ? (
                                        <span className="text-rose-400 font-semibold">Post button said "Log In" (Cookies not logged in)</span>
                                      ) : (
                                        item.message
                                      )
                                    ) : (
                                      `Generated: "${msgItem.message.substring(0, 40)}..."`
                                    )}
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
                            })
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* TAB 4: CSV EXPORTS & REPORTS */}
            {activeTab === "reports" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-sm text-slate-400 font-mono">
                    Download analytical reports and raw data sheets for external use
                  </span>
                </div>

                <div className="space-y-8">
                {/* 4.1. CSV Exporters Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  
                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Trending Coins CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Complete log report containing details of the top trending assets, dynamic live price changes, ranks, and coin URLs.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/trending_coins.csv")}
                      onClick={() => showToast("Downloading Trending Coins CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Generated Comments CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Complete listing of generated custom comments ready for automated Playwright commenting.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/generated_comments.csv")}
                      onClick={() => showToast("Downloading Generated Comments CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-purple-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Post Submissions CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Active cycle and recent execution logs representing each individual automated browser posting session.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/post_submissions.csv")}
                      onClick={() => showToast("Downloading Post Submissions CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 w-fit">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Overall Report CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        High-level summary representing overall run health, conversion rates, counts, and bot execution parameters.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/overall_report.csv")}
                      onClick={() => showToast("Downloading Overall Audit Report CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-amber-400" /> Download CSV
                    </a>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 w-fit">
                        <Archive className="h-5 w-5 text-indigo-400" />
                      </div>
                      <h3 className="font-bold text-white text-base">Archived Logs CSV</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Lifetime historical records of older pruned batches (&gt;{retentionDays}d), safely preserved for audit compliance.
                      </p>
                    </div>
                    <a
                      href={resolveUrl("/api/download/archived_submissions.csv")}
                      onClick={() => showToast("Downloading Archived Submissions CSV...", "info", 2500)}
                      className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5 text-indigo-400" /> Download Archive
                    </a>
                  </div>

                </div>

                {/* 4.2. Beautiful Interactive Analytics Center */}
                <div className="pt-6 border-t border-slate-800">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Success Rate Pie Chart (Radial SVG Chart) */}
                    <div className="lg:col-span-5 bg-slate-950 p-5 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center space-y-4">
                      <h4 className="font-bold text-white text-sm uppercase tracking-wider text-center">Submission Success Rate</h4>
                      
                      {results.length === 0 ? (
                        <div className="py-12 text-center text-sm text-slate-500 italic">
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
                              <div className="text-base font-bold text-emerald-400 font-mono">
                                {results.filter(r => r.status === "success").length} / {results.filter(r => r.status !== "skipped").length}
                              </div>
                            </div>
                            <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40">
                              <div className="text-[10px] text-slate-400 font-medium">Failed / Skipped</div>
                              <div className="text-base font-bold text-rose-400 font-mono">
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
                        <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-4">Sentiment & Channel Statistics</h4>
                        
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center text-sm text-slate-400 mb-1.5">
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
                            <div className="flex justify-between items-center text-sm text-slate-400 mb-1.5">
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
                            <div className="flex justify-between items-center text-sm text-slate-400 mb-1.5">
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

          {/* TAB 5: MARKETING IMAGES LIBRARY (STRICTLY 1 IMAGE PER COMMENT) */}
          {activeTab === "images" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* TOP HERO HEADER & MASTER TOGGLE */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-sm">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-base">Marketing & Signals Image Library</h3>
                      <span className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded ${imageUploadEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                        {imageUploadEnabled ? `ACTIVE • 1 IMAGE PER COMMENT (${marketingImages.length} Ready)` : 'PAUSED • TEXT-ONLY MODE'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Attaches 1 promotional or chart graphic to every comment across Manual Posting, Continuous Loop, and Scheduler.
                    </p>
                  </div>
                </div>

                {/* Master Toggle (Dedicated Right Position) */}
                <button
                  onClick={() => handleToggleImageUpload()}
                  disabled={isUpdatingImageSettings}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 cursor-pointer shrink-0 border ${
                    imageUploadEnabled
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-600/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                  }`}
                >
                  {imageUploadEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{imageUploadEnabled ? "Pause Image Uploading" : "Enable Image Uploading"}</span>
                </button>
              </div>

              {/* ORDERED 2-STEP UPLOAD & CLOUD IMPORT CARDS (Un-stuffed, clear hierarchy) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Step 1: Upload from Computer */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-mono uppercase font-bold text-emerald-400">Step 1 • Local Files</span>
                    <h4 className="text-sm font-bold text-white">Upload Images from Computer</h4>
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-200 pt-0.5">
                      <input
                        type="checkbox"
                        checked={replaceExistingOnUpload}
                        onChange={(e) => setReplaceExistingOnUpload(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <span>Replace existing library batch on upload</span>
                    </label>
                  </div>
                  <button
                    onClick={() => imageFileInputRef.current?.click()}
                    disabled={isUploadingImages}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50 shrink-0"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{isUploadingImages ? (uploadProgressText || "Uploading...") : "+ Upload Images"}</span>
                  </button>
                </div>

                {/* Step 2: Import from Drive / S3 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-mono uppercase font-bold text-teal-400">Step 2 • Cloud Sync</span>
                    <h4 className="text-sm font-bold text-white">Import from Google Drive / S3 / URL</h4>
                    <p className="text-xs text-slate-400">
                      Fetch daily chart packs directly from a shared Drive folder or S3 bucket.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsExternalImportModalOpen(true)}
                    className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-950/40 shrink-0"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Import Drive / S3</span>
                  </button>
                </div>
              </div>

              {/* ROTATION & RETENTION SETTINGS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rotation Policy</span>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSetImageMode("cycle")}
                      disabled={isUpdatingImageSettings}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer ${
                        imageSelectionMode === "cycle"
                          ? "bg-indigo-600 text-white shadow"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Sequential Cycle
                    </button>
                    <button
                      onClick={() => handleSetImageMode("random")}
                      disabled={isUpdatingImageSettings}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer ${
                        imageSelectionMode === "random"
                          ? "bg-indigo-600 text-white shadow"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Random Shuffle
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {imageSelectionMode === "cycle"
                      ? "Rotates through images 1 ➔ 2 ➔ 3 so consecutive comments never duplicate graphics."
                      : "Picks a random graphic from library for each coin submission."}
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Single Image Constraint</span>
                  <div className="text-base font-bold text-emerald-400 font-mono pt-1">Strictly 1 Image / Post</div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Enforces CoinMarketCap's community standard: exactly 1 graphic attached per comment.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Daily Auto-Prune Policy</span>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoPruneEnabled}
                        onChange={(e) => handleToggleAutoPrune(e.target.checked)}
                        className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{autoPruneEnabled ? "Auto-Delete ON" : "Retain All"}</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <select
                      value={autoPruneLimit}
                      onChange={(e) => handleToggleAutoPrune(autoPruneEnabled, Number(e.target.value))}
                      className="flex-1 py-1.5 px-2 bg-slate-900 border border-slate-800 rounded-lg text-sm font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value={10}>Keep latest 10 images</option>
                      <option value={20}>Keep latest 20 images</option>
                      <option value={30}>Keep latest 30 images</option>
                      <option value={50}>Keep latest 50 images</option>
                      <option value={100}>Keep latest 100 images</option>
                    </select>
                    {marketingImages.length > autoPruneLimit && (
                      <button
                        onClick={() => handleManualPruneNow(autoPruneLimit)}
                        disabled={isPruningImages}
                        className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-[11px] font-bold transition cursor-pointer shrink-0"
                        title="Prune excess older images right now"
                      >
                        Prune Now
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {autoPruneEnabled
                      ? `When daily images arrive, graphics older than the ${autoPruneLimit} newest are automatically deleted.`
                      : "Maintains all graphics until manually batch-deleted or replaced."}
                  </p>
                </div>
              </div>

              {/* ARCHITECTURE & FUTURE SOURCE NOTE */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2.5 text-slate-300">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider shrink-0">
                    Source Agnostic
                  </span>
                  <span className="text-slate-400">
                    Images can be provided via dashboard upload, local drop, daily S3 bucket sync, or external API feed anytime without breaking posting logic.
                  </span>
                </div>
              </div>

              {/* SCALABLE MEDIA GALLERY TOOLBAR */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      SpikeSignals Image Library
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-mono">
                        {marketingImages.length} images ({((totalMarketingBytes / 1024) > 1024 ? (totalMarketingBytes / (1024 * 1024)).toFixed(1) + " MB" : (totalMarketingBytes / 1024).toFixed(0) + " KB")})
                      </span>
                    </h4>
                  </div>

                  {/* GALLERY SELECTION, SEARCH & VIEW SWITCHER */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Select All / Deselect All */}
                    {marketingImages.length > 0 && (
                      <button
                        onClick={handleSelectAllImages}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-sm font-semibold transition cursor-pointer"
                      >
                        {selectedImageFilenames.length === marketingImages.length
                          ? "Deselect All"
                          : `Select All (${marketingImages.length})`}
                      </button>
                    )}

                    {/* Batch Delete Selected button */}
                    {selectedImageFilenames.length > 0 && (
                      <button
                        onClick={handleBatchDeleteSelectedImages}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-all duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title={(isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) ? "Locked while posting is active" : "Delete selected images"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Selected ({selectedImageFilenames.length})
                      </button>
                    )}

                    {marketingImages.length > 0 && (
                      <button
                        onClick={handleClearAllMarketingImages}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-slate-800 hover:border-red-500/30 text-sm font-bold transition-all duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
                        title={(isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) ? "Locked while posting is active" : "Remove all images"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear All
                      </button>
                    )}

                    <button
                      onClick={fetchMarketingImages}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition cursor-pointer"
                      title="Reload images"
                      aria-label="Reload images"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={imageSearchQuery}
                        onChange={(e) => {
                          setImageSearchQuery(e.target.value);
                          setImagePage(1);
                        }}
                        placeholder="Filter by filename..."
                        className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44 sm:w-56"
                      />
                      {imageSearchQuery && (
                        <button
                          onClick={() => {
                            setImageSearchQuery("");
                            setImagePage(1);
                          }}
                          className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* View Switcher: Grid vs List */}
                    <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setImageViewMode("grid")}
                        className={`p-1.5 rounded-md text-sm transition cursor-pointer ${
                          imageViewMode === "grid"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Compact Grid View (High Density)"
                        aria-label="Compact Grid View"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setImageViewMode("list")}
                        className={`p-1.5 rounded-md text-sm transition cursor-pointer ${
                          imageViewMode === "list"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="List Table View (Compact Rows)"
                        aria-label="List Table View"
                      >
                        <List className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Page Size Select */}
                    <select
                      value={imagePageSize}
                      onChange={(e) => {
                        setImagePageSize(Number(e.target.value));
                        setImagePage(1);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      title="Items per page"
                    >
                      <option value={12}>12 / page</option>
                      <option value={24}>24 / page</option>
                      <option value={48}>48 / page</option>
                      <option value={96}>96 / page</option>
                    </select>
                  </div>
                </div>

                {/* Sub-bar: showing pagination info */}
                {filteredMarketingImages.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-900 pt-2.5">
                    <span>
                      Showing {Math.min((currentPageClamped - 1) * imagePageSize + 1, filteredMarketingImages.length)} -{" "}
                      {Math.min(currentPageClamped * imagePageSize, filteredMarketingImages.length)} of{" "}
                      {filteredMarketingImages.length} {imageSearchQuery ? "matching images" : "images"}
                    </span>

                    {totalImagePages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setImagePage((p) => Math.max(1, p - 1))}
                          disabled={currentPageClamped <= 1}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 rounded border border-slate-800 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Prev
                        </button>
                        <span className="font-mono text-slate-300 px-1.5">
                          {currentPageClamped} / {totalImagePages}
                        </span>
                        <button
                          onClick={() => setImagePage((p) => Math.min(totalImagePages, p + 1))}
                          disabled={currentPageClamped >= totalImagePages}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 rounded border border-slate-800 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Next
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* IMAGE GALLERY VIEW CONTAINER */}
              <div>
                {filteredMarketingImages.length === 0 ? (
                  marketingImages.length === 0 ? (
                    <div
                      onClick={() => imageFileInputRef.current?.click()}
                      className="bg-slate-950/60 p-12 text-center rounded-2xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 transition cursor-pointer space-y-3"
                    >
                      <Upload className="h-10 w-10 text-indigo-400 mx-auto" />
                      <p className="text-base text-slate-300 font-semibold">No images currently in library</p>
                      <p className="text-sm text-slate-500 max-w-md mx-auto">
                        Click here to upload your 5 SpikeSignals infographics (PNG/JPG). In the future, daily images from an S3 bucket or API can be dropped here as well.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-950 p-8 text-center rounded-2xl border border-slate-800 text-slate-400 text-sm">
                      No graphics found matching "{imageSearchQuery}". Try a different filter term.
                    </div>
                  )
                ) : imageViewMode === "grid" ? (
                  /* COMPACT HIGH-DENSITY GRID (Optimized for 50-200+ images) */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {paginatedMarketingImages.map((img) => {
                      const overallIndex = marketingImages.findIndex((m) => m.filename === img.filename);
                      const isNext =
                        imageSelectionMode === "cycle" &&
                        marketingImages.length > 0 &&
                        activeImageIndex % marketingImages.length === overallIndex;

                      return (
                        <div
                          key={img.filename}
                          className={`bg-slate-950 rounded-xl border overflow-hidden flex flex-col justify-between transition-all duration-150 group relative hover:border-indigo-500/70 hover:shadow-lg ${
                            isNext
                              ? "border-indigo-500 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500"
                              : "border-slate-800"
                          }`}
                        >
                          {/* Compact Thumbnail Frame */}
                          <div
                            onClick={() => setPreviewModalImage(img)}
                            className="aspect-square bg-slate-900 relative overflow-hidden cursor-pointer"
                          >
                            <SafeImageDisplay
                              src={resolveUrl(img.url)}
                              fallbackSrc={resolveUrl(`/output/marketing_images/${encodeURIComponent(img.filename)}`)}
                              alt={img.filename}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />

                            {/* Checkbox & Status badges */}
                            <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedImageFilenames.includes(img.filename)}
                                onChange={() => handleToggleSelectImage(img.filename)}
                                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900/90 text-indigo-600 focus:ring-0 cursor-pointer shadow"
                              />
                              {isNext && (
                                <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                  NEXT
                                </span>
                              )}
                            </div>

                            <div className="absolute top-1.5 right-1.5 bg-slate-950/80 backdrop-blur-sm text-slate-300 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-800">
                              #{overallIndex + 1}
                            </div>

                            {/* Hover Quick Actions Overlay */}
                            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewModalImage(img);
                                }}
                                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow cursor-pointer"
                                title="Expand Preview"
                                aria-label="Expand Preview"
                              >
                                <Maximize2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMarketingImage(img.filename);
                                }}
                                className="p-2 bg-slate-800 hover:bg-red-500 text-slate-300 hover:text-white rounded-lg shadow cursor-pointer"
                                title="Delete image"
                                aria-label="Delete image"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Compact File Info */}
                          <div className="p-2 border-t border-slate-900 bg-slate-950/90">
                            <h5
                              className="font-medium text-white text-[11px] truncate cursor-pointer hover:text-indigo-300"
                              title={img.filename}
                              onClick={() => setPreviewModalImage(img)}
                            >
                              {img.filename}
                            </h5>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                              <span>{(img.sizeBytes / 1024).toFixed(0)} KB</span>
                              <span className="text-[9px] text-slate-600">
                                {img.updatedAt ? new Date(img.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* COMPACT LIST TABLE VIEW (Ultra-compact for 100+ images) */
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3 w-16 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  paginatedMarketingImages.length > 0 &&
                                  paginatedMarketingImages.every((img) => selectedImageFilenames.includes(img.filename))
                                }
                                onChange={() => {
                                  const pageFilenames = paginatedMarketingImages.map((img) => img.filename);
                                  const allSelected = pageFilenames.every((f) => selectedImageFilenames.includes(f));
                                  if (allSelected) {
                                    setSelectedImageFilenames((prev) => prev.filter((f) => !pageFilenames.includes(f)));
                                  } else {
                                    setSelectedImageFilenames((prev) => Array.from(new Set([...prev, ...pageFilenames])));
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                                title="Select / Deselect all on this page"
                              />
                            </th>
                            <th className="py-2.5 px-3 w-16">Preview</th>
                            <th className="py-2.5 px-3">Filename</th>
                            <th className="py-2.5 px-3 w-24">Size</th>
                            <th className="py-2.5 px-3 w-28">Date Added</th>
                            <th className="py-2.5 px-3 w-32">Queue Status</th>
                            <th className="py-2.5 px-3 w-20 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                          {paginatedMarketingImages.map((img) => {
                            const overallIndex = marketingImages.findIndex((m) => m.filename === img.filename);
                            const isNext =
                              imageSelectionMode === "cycle" &&
                              marketingImages.length > 0 &&
                              activeImageIndex % marketingImages.length === overallIndex;

                            return (
                              <tr
                                key={img.filename}
                                className="hover:bg-slate-900/50 transition cursor-pointer"
                                onClick={() => setPreviewModalImage(img)}
                              >
                                <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={selectedImageFilenames.includes(img.filename)}
                                      onChange={() => handleToggleSelectImage(img.filename)}
                                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                                    />
                                    <span>#{overallIndex + 1}</span>
                                  </div>
                                </td>
                                <td className="py-1.5 px-3">
                                  <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0">
                                    <SafeImageDisplay
                                      src={resolveUrl(img.url)}
                                      fallbackSrc={resolveUrl(`/output/marketing_images/${encodeURIComponent(img.filename)}`)}
                                      alt={img.filename}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-white hover:text-indigo-300 transition text-sm block truncate max-w-xs sm:max-w-md">
                                    {img.filename}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400 text-[11px]">
                                  {(img.sizeBytes / 1024).toFixed(1)} KB
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px]">
                                  {img.updatedAt ? new Date(img.updatedAt).toLocaleDateString() : "—"}
                                </td>
                                <td className="py-2 px-3">
                                  {isNext ? (
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                                      NEXT IN LINE
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-600">In pool</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => setPreviewModalImage(img)}
                                      className="p-1 hover:text-indigo-400 text-slate-400 transition cursor-pointer"
                                      title="Preview"
                                      aria-label="Preview"
                                    >
                                      <Maximize2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMarketingImage(img.filename)}
                                      className="p-1 hover:text-red-400 text-slate-500 transition cursor-pointer"
                                      title="Delete"
                                      aria-label="Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* BOTTOM PAGINATION BAR */}
                {totalImagePages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-900 text-sm text-slate-400">
                    <div>
                      Page <span className="text-white font-bold">{currentPageClamped}</span> of{" "}
                      <span className="text-white font-bold">{totalImagePages}</span> ({filteredMarketingImages.length} items total)
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setImagePage(1)}
                        disabled={currentPageClamped <= 1}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed"
                      >
                        « First
                      </button>
                      <button
                        onClick={() => setImagePage((p) => Math.max(1, p - 1))}
                        disabled={currentPageClamped <= 1}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft className="h-3 w-3" />
                        Prev
                      </button>

                      {/* Numeric page pills */}
                      {Array.from({ length: Math.min(5, totalImagePages) }, (_, i) => {
                        let pageNum = i + 1;
                        if (totalImagePages > 5) {
                          if (currentPageClamped > 3 && currentPageClamped < totalImagePages - 1) {
                            pageNum = currentPageClamped - 2 + i;
                          } else if (currentPageClamped >= totalImagePages - 1) {
                            pageNum = totalImagePages - 4 + i;
                          }
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setImagePage(pageNum)}
                            className={`w-7 h-7 rounded-lg text-sm font-mono font-bold transition cursor-pointer ${
                              currentPageClamped === pageNum
                                ? "bg-indigo-600 text-white shadow"
                                : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setImagePage((p) => Math.min(totalImagePages, p + 1))}
                        disabled={currentPageClamped >= totalImagePages}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setImagePage(totalImagePages)}
                        disabled={currentPageClamped >= totalImagePages}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Last »
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* EXTERNAL IMAGES IMPORT MODAL (Google Drive, S3, Web URLs) */}
              {isExternalImportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                          <Upload className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-base font-bold text-white">Import from Google Drive / S3 / Cloud URLs</h3>
                          <p className="text-sm text-slate-400">Paste shared Google Drive links, S3 bucket URLs, or image web links</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setIsExternalImportModalOpen(false);
                          setExternalImportStatus(null);
                        }}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                        title="Close modal"
                        aria-label="Close modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                          Cloud Link or Image URLs (One per line or comma-separated)
                        </label>
                        <textarea
                          value={externalImportLinks}
                          onChange={(e) => setExternalImportLinks(e.target.value)}
                          placeholder={`Google Drive Folder: https://drive.google.com/drive/folders/1ABC...
Google Drive File: https://drive.google.com/file/d/1XYZ...
S3 Bucket / Image URLs:
https://my-bucket.s3.amazonaws.com/promo1.png
https://my-bucket.s3.amazonaws.com/promo2.jpg`}
                          rows={5}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Tip: For Google Drive folders, ensure the folder sharing link is set to "Anyone with the link can view".
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="modalReplaceExisting"
                          checked={externalImportReplace}
                          onChange={(e) => setExternalImportReplace(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-0 cursor-pointer accent-emerald-600"
                        />
                        <label htmlFor="modalReplaceExisting" className="text-sm text-slate-300 font-medium cursor-pointer select-none">
                          Replace existing images with this new imported batch
                        </label>
                      </div>

                      {externalImportStatus && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-300 font-mono">
                          {externalImportStatus}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setIsExternalImportModalOpen(false);
                            setExternalImportStatus(null);
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isImportingExternal || !externalImportLinks.trim()}
                          onClick={handleImportExternalImages}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
                        >
                          {isImportingExternal ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Importing Images...
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" />
                              Start Cloud Import
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FULL LIGHTBOX PREVIEW MODAL */}
              {previewModalImage && (
                <div
                  className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
                  onClick={() => setPreviewModalImage(null)}
                >
                  <div
                    className="bg-slate-950 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Modal Top Bar */}
                    <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <ImageIcon className="h-4 w-4 text-indigo-400 shrink-0" />
                        <h4 className="text-sm font-bold text-white truncate font-mono">
                          {previewModalImage.filename}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          ({(previewModalImage.sizeBytes / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => setPreviewModalImage(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                        title="Close preview"
                        aria-label="Close preview"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Image Viewport with Next/Prev Arrows */}
                    <div className="flex-1 bg-black/50 p-4 flex items-center justify-center overflow-auto max-h-[70vh] relative group">
                      {marketingImages.length > 1 && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = marketingImages.findIndex((m) => m.filename === previewModalImage.filename);
                              const prevIdx = (idx - 1 + marketingImages.length) % marketingImages.length;
                              setPreviewModalImage(marketingImages[prevIdx]);
                            }}
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700/80 shadow-xl transition cursor-pointer z-20 opacity-70 group-hover:opacity-100"
                            title="Previous Image (← Left Arrow)"
                            aria-label="Previous Image"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = marketingImages.findIndex((m) => m.filename === previewModalImage.filename);
                              const nextIdx = (idx + 1) % marketingImages.length;
                              setPreviewModalImage(marketingImages[nextIdx]);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700/80 shadow-xl transition cursor-pointer z-20 opacity-70 group-hover:opacity-100"
                            title="Next Image (→ Right Arrow)"
                            aria-label="Next Image"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      <SafeImageDisplay
                        src={resolveUrl(previewModalImage.url)}
                        fallbackSrc={resolveUrl(`/output/marketing_images/${encodeURIComponent(previewModalImage.filename)}`)}
                        alt={previewModalImage.filename}
                        className="max-h-[66vh] max-w-full object-contain rounded-lg shadow-lg border border-slate-900"
                      />
                    </div>

                    {/* Modal Bottom Actions Bar */}
                    <div className="p-3.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold">
                          #{marketingImages.findIndex((m) => m.filename === previewModalImage.filename) + 1} of {marketingImages.length}
                        </span>
                        <span className="hidden sm:inline text-slate-500">
                          (Use ← / → keys to flip, Esc to close)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            handleDeleteMarketingImage(previewModalImage.filename);
                            setPreviewModalImage(null);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-sm font-medium transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete Image
                        </button>
                        <button
                          onClick={() => setPreviewModalImage(null)}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </section>
      </main>
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-sm text-slate-500">
        <p className="tracking-wide">CoinMarketCap Automated Community Bot Control Panel © 2026. All rights reserved.</p>
      </footer>

      {/* MODAL: PASTE COOKIE SESSION OR LOGIN */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-5 pb-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                  <Key className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-white text-base">
                  Configure Playwright Session
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowSessionModal(false);
                  handleResetLoginState();
                }}
                title="Close modal"
                aria-label="Close modal"
                className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Selection */}
            <div className="px-5 pt-3 flex items-center gap-6 border-b border-slate-800 bg-slate-950/20 overflow-x-auto">
              <button
                onClick={() => {
                  setLoginTab("credentials");
                  handleResetLoginState();
                }}
                disabled={isBusy || isContinuousLoopActive}
                className={`pb-3 text-sm font-bold whitespace-nowrap transition-all relative disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  loginTab === "credentials" ? "text-emerald-400 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Automated Login (New)
              </button>
              <button
                onClick={() => setLoginTab("cookies")}
                disabled={isBusy || isContinuousLoopActive}
                className={`pb-3 text-sm font-bold whitespace-nowrap transition-all relative disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
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
                className={`pb-3 text-sm font-bold whitespace-nowrap transition-all relative disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  loginTab === "profiles" ? "text-emerald-400 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Switch Accounts ({profilesList.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">

              {loginTab === "credentials" && (
                <div className="space-y-4 text-sm">
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Log in directly using your CoinMarketCap credentials. Our backend Playwright browser will run the login, handle security, and capture/save the <code className="text-emerald-400 font-mono">state.json</code> automatically!
                  </p>

                  {loginStep === "idle" && (
                    <div className="space-y-3.5">
                      <div className="space-y-1.5">
                        <label className="text-xs uppercase text-slate-400 font-mono tracking-widest font-bold">Email Address</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleStartLogin();
                          }}
                          placeholder="your-email@example.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs uppercase text-slate-400 font-mono tracking-widest font-bold">Password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleStartLogin();
                          }}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                        />
                      </div>
                      <button
                        onClick={handleStartLogin}
                        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
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
                        <h4 className="font-bold text-white text-base">Processing CoinMarketCap Authentication...</h4>
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
                          className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition cursor-pointer shadow-sm"
                        >
                          Finish & Close
                        </button>
                        <button
                          onClick={() => {
                            handleResetLoginState();
                            setLoginTab("credentials");
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          ➕ Add Another Account
                        </button>
                        <button
                          onClick={() => {
                            handleResetLoginState();
                            setLoginTab("profiles");
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-1.5"
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
                          <Search className="h-3.5 w-3.5" /> Check If Already Logged In / Verify Session
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
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold cursor-pointer transition shadow-sm"
                        >
                          Retry Login (Re-enter)
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {loginTab === "cookies" && (
                <div className="space-y-3.5 text-sm text-slate-300">
                  <p>
                    Directly paste your existing CoinMarketCap <strong>login cookie storage state</strong> JSON array if you prefer not to enter your credentials.
                  </p>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 text-xs leading-relaxed text-slate-400">
                    <span className="font-bold text-white block">How to obtain cookies manually:</span>
                    1. Log into your account on CoinMarketCap in Chrome.<br />
                    2. Use a browser extension like "EditThisCookie" or Playwright CLI to export cookies/storage as a JSON array.<br />
                    3. Paste the complete JSON object below.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase text-slate-400 font-mono font-bold">Profile Name (Optional)</label>
                      <input
                        type="text"
                        value={newProfileName}
                        disabled={isBusy || isContinuousLoopActive}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder="e.g. Main Account"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-600 text-sm disabled:opacity-40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase text-slate-400 font-mono font-bold">Daily Post Limit</label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={newProfileLimit}
                        disabled={isBusy || isContinuousLoopActive}
                        onChange={(e) => setNewProfileLimit(Math.max(1, parseInt(e.target.value) || 500))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm font-mono disabled:opacity-40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase text-slate-400 font-mono font-bold">Proxy (Optional)</label>
                      <input
                        type="text"
                        value={newProfileProxy}
                        disabled={isBusy || isContinuousLoopActive}
                        onChange={(e) => setNewProfileProxy(e.target.value)}
                        placeholder="http://user:pass@ip:port"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm font-mono disabled:opacity-40 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase text-slate-400 font-mono tracking-widest font-bold">Paste state.json content</label>
                    <textarea
                      rows={6}
                      value={sessionJson}
                      disabled={isBusy || isContinuousLoopActive}
                      onChange={(e) => setSessionJson(e.target.value)}
                      placeholder='{ "cookies": [ { "name": "session_token", "value": "..." } ] }'
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 placeholder-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Locked while process is active" : "Log In Another Account"}
                      >
                        🔑 + Log In New Account
                      </button>
                      <button
                        onClick={() => setLoginTab("cookies")}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={(isBusy || isPostingActive || isContinuousLoopActive) ? "Locked while process is active" : "Import Cookies JSON"}
                      >
                        📋 Import Cookies JSON
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <h4 className="font-bold text-slate-300 font-mono text-xs uppercase tracking-wider">Saved Accounts Profiles ({profilesList.length})</h4>
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
                                  ⚡ Limit: {p.dailyPostLimit || 300}/day
                                </span>
                                {p.proxy && (
                                  <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] px-2 py-0.5 rounded font-mono font-bold truncate max-w-[160px]" title={`Proxy: ${p.proxy}`}>
                                    🌐 {p.proxy.replace(/^https?:\/\//, "")}
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
                                <span className="text-xs text-slate-400 font-mono">
                                  ID: {p.id} • Saved: {new Date(p.updatedAt).toLocaleString()}
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
                                    {p.proxy ? "Edit Proxy" : "+ Set Proxy"}
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
                                      ? "Cannot switch accounts while posting or automation is active. Click 'Stop Posting' first."
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
                                className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 cursor-pointer"
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
                                  className="py-1.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="py-2 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold transition cursor-pointer"
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
                <p className="text-sm text-slate-400 leading-relaxed">
                  Trending coins have already been fetched. Refetching will clear current trending data, reset generated comments, and clear posting statistics first.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmFetchModal(false)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) {
                    showToast("Cannot reset and refetch while a bot process is running.", "warning");
                    setShowConfirmFetchModal(false);
                    return;
                  }
                  setShowConfirmFetchModal(false);
                  await runCommand("/api/clear-all", "clear", { force: true });
                  await runCommand("/api/fetch-trending", "fetch");
                }}
                disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                className="py-2 px-5 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition cursor-pointer"
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
                <p className="text-sm text-slate-400 leading-relaxed">
                  Comments have already been generated. Regenerating will overwrite existing comments and reset your current posting sequence progress.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmGenerateModal(false)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowConfirmGenerateModal(false);
                  await runCommand("/api/generate-messages", "generate");
                }}
                className="py-2 px-5 bg-purple-500 hover:bg-purple-400 text-slate-950 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Yes, Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET QUEUE / CLEAR SUBMISSIONS CONFIRMATION MODAL */}
      {showResetQueueConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 flex-shrink-0">
                <RotateCcw className="h-6 w-6" />
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-white text-base">
                  Archive Batch & Restart Queue?
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  This resets the queue index back to Coin #1 for <strong>{activeProfile?.name || "the active profile"}</strong>. All completed submission records will be automatically moved into your <strong>7-Day Retention Archive</strong> so no historical results are lost. Your CoinMarketCap logins, cookies, and daily post caps remain 100% intact.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetQueueConfirm(false)}
                disabled={isResettingDailyQueue}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResetDailyQueue(false)}
                disabled={isResettingDailyQueue || isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                className="py-2 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResettingDailyQueue ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Archiving & Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Archive & Restart Queue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATA RETENTION & COMPACTION SETTINGS MODAL */}
      {showRetentionSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <span className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 flex-shrink-0">
                <Clock className="h-6 w-6" />
              </span>
              <div className="space-y-1 flex-1">
                <h3 className="font-bold text-white text-base">
                  Data Retention & Lifecycle Policy
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Configure how long older trending coins, completed comment batches, and submission logs are kept in active memory.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <label className="text-sm font-bold text-slate-300 block">
                  Keep Active Submission Records For:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveRetentionSettings(4, true)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      retentionDays === 4
                        ? "bg-indigo-500/20 border-indigo-500 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-base">4 Days (Lean & Fast)</div>
                    <div className="text-[11px] text-slate-400 mt-1">Recommended for high-frequency bots running continuous cycles.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveRetentionSettings(7, true)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      retentionDays === 7
                        ? "bg-indigo-500/20 border-indigo-500 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-base">7 Days (Standard)</div>
                    <div className="text-[11px] text-slate-400 mt-1">Preserves one full week of posting data before archiving.</div>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-200">Auto-Archive Completed Batches</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">ENABLED</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  When all comments in a cycle batch (e.g. 70+ posts) are completely posted, the active queue resets automatically so the next cycle starts fresh with zero blockage or slowdown.
                </p>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                <div className="text-sm text-amber-300">
                  <span className="font-bold">Manual Clean Now:</span> Immediately prune records older than {retentionDays} days into the archive.
                </div>
                <button
                  onClick={() => {
                    setShowRetentionSettingsModal(false);
                    handlePruneOldData(retentionDays);
                  }}
                  disabled={isPruningData}
                  className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg transition cursor-pointer whitespace-nowrap ml-3"
                >
                  {isPruningData ? "Pruning..." : "Prune Now"}
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                onClick={() => setShowRetentionSettingsModal(false)}
                className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Close
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
                  <p className="text-sm text-slate-400">Review what happens before switching profiles</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmSwitchProfile(null)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile comparison card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-sm">
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
            <div className="space-y-2.5 text-sm text-slate-300">
              <div className="font-semibold text-slate-200 text-sm">Here is what will happen when you switch:</div>
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
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-300 text-sm font-semibold animate-pulse">
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span>Posting or background process is running! You must click "Stop Posting" before switching accounts to prevent data corruption.</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfirmSwitchProfile(null)}
                className="py-2 px-4 rounded-xl text-slate-400 hover:text-white text-sm font-semibold hover:bg-slate-800 transition"
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
                className="py-2.5 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* STALE MARKET DATA WARNING MODAL (> 2 DAYS OLD) */}
      {showStaleWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Warning: Market Data Over 2 Days Old</h3>
                  <p className="text-sm text-amber-400/90 font-medium">Trending coins & comments were fetched over 48 hours ago</p>
                </div>
              </div>
              <button
                onClick={() => setShowStaleWarningModal(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Age summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 font-mono uppercase font-bold">Coins Fetched</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {formatTimeAgo(coinsFetchedAt).text}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {formatTimeAgo(coinsFetchedAt).full}
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 font-mono uppercase font-bold">Comments Generated</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {formatTimeAgo(commentsGeneratedAt).text}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {formatTimeAgo(commentsGeneratedAt).full}
                </div>
              </div>
            </div>

            {/* Warning Explanation */}
            <div className="space-y-2 text-sm text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <p className="font-semibold text-slate-200">
                Why we recommend fetching fresh market data:
              </p>
              <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside">
                <li>Crypto prices, percentage gains, and trends shift dramatically in 48 hours.</li>
                <li>Posting comments quoting outdated prices can appear robotic or incorrect to community members.</li>
                <li>Fetching fresh coins ensures your account posts timely, accurate commentary with relevant AI insights.</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                onClick={() => handleRefreshFreshData(false)}
                disabled={isRefreshingFreshData}
                className="flex-1 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingFreshData ? "animate-spin" : ""}`} />
                {isRefreshingFreshData ? "Refreshing Data..." : "Fetch New Data First (Recommended)"}
              </button>
              <button
                onClick={async () => {
                  setShowStaleWarningModal(false);
                  setIsStartingPost(true);
                  await runCommand("/api/post-chat", "post", { force: true });
                }}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium rounded-xl text-sm transition border border-slate-700 cursor-pointer text-center"
              >
                Post Anyway
              </button>
              <button
                onClick={() => setShowStaleWarningModal(false)}
                className="py-2.5 px-3 text-slate-400 hover:text-slate-200 font-medium rounded-xl text-sm transition hover:bg-slate-800/50 cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Floating Toast with Process Indicator, Turn Off toggle, and Dismiss (No persistent history) */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4.5 py-3 rounded-2xl border shadow-2xl bg-slate-900/95 border-slate-800 text-sm text-white max-w-md backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-200">
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
          ) : toast.type === "warning" ? (
            <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
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
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {inlineConfirmModal && inlineConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <h3 className="text-base font-bold text-white">{inlineConfirmModal.title || "Confirm Action"}</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{inlineConfirmModal.message}</p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setInlineConfirmModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = inlineConfirmModal.onConfirm;
                  setInlineConfirmModal(null);
                  fn();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition cursor-pointer shadow-md"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
