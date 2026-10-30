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
  Square,
  Settings
} from "lucide-react";
import { api, apiFetch, SchedulerStatusResponse, SchedulerAccountItem, SchedulerFileInfo, MarketingImage, HealthResponse } from "./api";
import type { Coin, GeneratedMessage, PostResult, LogEntry, Profile, CustomSelectOption } from "./types";
import {
  resolveUrl,
  parseResponseJson,
  areLogsEqual,
  areCoinsEqual,
  areMessagesEqual,
  areResultsEqual,
  areProfilesEqual,
  formatTimeAgo,
} from "./utils/ui-helpers";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SafeImageDisplay } from "./components/SafeImageDisplay";
import { CycleCountdown } from "./components/CycleCountdown";
import { CustomSelect } from "./components/CustomSelect";
import { renderAdminPage } from "./pages/AdminPage";
import { renderSchedulerPage } from "./pages/SchedulerPage";
import { renderGuidePage } from "./pages/GuidePage";
import { renderLogsPage } from "./pages/LogsPage";
import { renderHealthPage } from "./pages/HealthPage";
import { renderDashboardPage } from "./pages/DashboardPage";
import { renderAdminLoginGate } from "./components/AdminLoginGate";
import { renderHeaderNavbar } from "./components/HeaderNavbar";
import { renderSessionAccountModal } from "./components/SessionAccountModal";
import { renderModalsLayer } from "./components/ModalsLayer";

export { ErrorBoundary };

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

  const [adminSection, setAdminSection] = useState<"security" | "telegram" | "retention">("security");
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

  const navigateTo = (view: "dashboard" | "scheduler" | "admin" | "guide" | "logs" | "health", section?: "diagnostics" | "secrets" | "telegram" | "security" | "retention") => {
    setCurrentView(view);
    if (section === "telegram" || section === "security" || section === "retention") {
      setAdminSection(section);
    }
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

  // Global background polling for header status dot, scheduler badge, and initial profile hydration
  useEffect(() => {
    let isMounted = true;
    fetchProfiles();
    fetchSessionDetails();
    fetchStats();
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
  const checkSystemHealth = async (force = false) => {
    setIsCheckingSystem(true);
    try {
      const url = force ? "/api/check-system?force=true" : "/api/check-system";
      const res = await apiFetch(resolveUrl(url));
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

  // Automatically verify system & Playwright diagnostics on app mount and when visiting /admin
  useEffect(() => {
    checkSystemHealth(false);
  }, []);

  useEffect(() => {
    if (currentView === "health" && !systemCheckResult && !isCheckingSystem) {
      checkSystemHealth(false);
    }
  }, [currentView, systemCheckResult, isCheckingSystem]);

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
    else if (endpoint.includes("post-chat")) processLabel = "Opening CoinMarketCap browser to post comments...";
    else if (endpoint.includes("stop-posting")) processLabel = "Stopping posting sequence...";
    else if (endpoint.includes("full-flow")) processLabel = "Starting full automated bot cycle...";
    else if (endpoint.includes("clear-all")) processLabel = "Resetting local storage and clearing data...";
    else if (endpoint.includes("clear-session")) processLabel = "Removing saved account login session...";

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
      matchesLevel =
        l.message.includes("[SCHEDULER]") ||
        l.message.includes("[SYNC]") ||
        l.message.includes("Run finished") ||
        l.message.includes("Sequential") ||
        l.message.includes("Beginning turn (Account") ||
        l.message.includes("Launching automated posting loop");
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
    return renderAdminLoginGate(isContinuousLoopActive, adminPasswordInput, setAdminPasswordInput, showAdminPassword, setShowAdminPassword, adminAuthLoading, adminLoginError, setAdminLoginError, rememberAdminLogin, setRememberAdminLogin, adminSchedulerStatus, handleAdminLogin, password);
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
      {renderHeaderNavbar(status, isContinuousLoopActive, healthData, switchingProfileId, sessionExists, setShowSessionModal, profilesList, activeProfile, currentView, navigateTo, setLoginTab, schedulerData, isPostingActive, isBusy, promptSwitchProfile, handleResetLoginState)}

      {/* DASHBOARD OR ADMIN SCREEN CONTENT BODY */}
      {currentView === "admin" ? (
        renderAdminPage(navigateTo, adminSection, setAdminSection, adminAuthRequired, telegramEnabled, retentionDays, handleSaveRetentionSettings, handlePruneOldData, isPruningData, isBusy, isPostingActive, handleToggleTelegram, telegramToken, telegramChatId, handleDetectTelegramChatId, isDetectingTelegram, handleTestEmergencyAlert, isTestingTelegram, handleToggleAdminAuth, showRevealedAdminPassword, setShowRevealedAdminPassword, handleCopyPassword, currentAdminPassword, handleCopyShareLink, newAdminPasswordInput, setNewAdminPasswordInput, handleUpdatePassword)
      ) : currentView === "scheduler" ? (
        renderSchedulerPage(schedulerData, toggleNotifications, notificationsEnabled, setLogsTab, navigateTo, isSchedulerActionPending, isSchedulerRunning, handleToggleScheduler, schedulerIntervalInput, setSchedulerIntervalInput, handleUpdateSchedulerInterval, targetCoinsCount, handleUpdateTargetCoins, isBusy, handleResumeScheduler, handleRunSchedulerNow, handlePauseScheduler, handleStopScheduler, imageUploadEnabled, marketingImages, imageSelectionMode, handleToggleImageUpload, isUpdatingImageSettings, imageFileInputRef, isUploadingImages, setActiveTab, handleResetLoginState, setLoginTab, setShowSessionModal, handleDragStart, handleDragOver, handleDrop, draggedAccountIndex, handleDirectOrderInput, handleMoveAccount, handleUpdateAccountSchedule)
      ) : currentView === "guide" ? (
        renderGuidePage(navigateTo, handleResetLoginState, setLoginTab, setShowSessionModal, guideStep, setGuideStep, imageFileInputRef, setActiveTab, marketingImages)
      ) : currentView === "logs" ? (
        renderLogsPage(logsTab, setLogsTab, navigateTo, setInlineConfirmModal, runCommand, isPending, logSearchQuery, setLogSearchQuery, autoScroll, setAutoScroll, terminalContainerRef, logFilter, setLogFilter, filteredLogs, terminalEndRef, schedulerLogs, schedulerLogQuery, setSchedulerLogQuery)
      ) : currentView === "health" ? (
        renderHealthPage(checkSystemHealth, isCheckingSystem, navigateTo, healthData, systemCheckResult, apiStatus, storageInfo, activeProfile, toggleNotifications, notificationsEnabled)
      ) : (
        /* MAIN BOT DASHBOARD */
        renderDashboardPage(navigateTo, isBusy, isPostingActive, schedulerData, toggleNotifications, notificationsEnabled, isSchedulerRunning, imageUploadEnabled, marketingImages, imageSelectionMode, handleToggleImageUpload, isUpdatingImageSettings, imageFileInputRef, isUploadingImages, setActiveTab, setInlineConfirmModal, runCommand, isPending, activeProfile, profilesList, sessionExists, dailyPostCount, coinsList, messagesList, postedCount, failedCount, setIsExternalImportModalOpen, totalCoins, isContinuousLoopActive, showToast, isStoppingPost, generatedCount, activeProcess, activeProcessDescription, setShowConfirmFetchModal, coinsFetchedAt, setShowConfirmGenerateModal, commentsGeneratedAt, setIsStoppingPost, isDataOlderThan2Days, setShowStaleWarningModal, setIsStartingPost, isStartingPost, handleRefreshFreshData, isRefreshingFreshData, continuousInterval, toggleContinuousLoop, setContinuousInterval, saveIntervalToServer, nextCycleStartTime, activeImageIndex, activeProfileIdRef, results, progressIndex, currentCoin, dailyPostLimit, retentionDays, isRefreshingData, handleManualRefresh, activeTab, setSubmissionsViewMode, submissionsViewMode, setShowRetentionSettingsModal, setShowResetQueueConfirm, isResettingDailyQueue, handleRetrySingle, individualLoading, handleCopyAndOpenCMC, isExternalImportModalOpen, setExternalImportStatus, handleClearAllMarketingImages, imageSearchQuery, setImageSearchQuery, imagePageSize, setImagePageSize, setImagePage, setPreviewModalImage, handleDeleteMarketingImage, externalImportLinks, setExternalImportLinks, externalImportReplace, setExternalImportReplace, externalImportStatus, isImportingExternal, handleImportExternalImages, previewModalImage, replaceExistingOnUpload, setReplaceExistingOnUpload, uploadProgressText, handleSetImageMode, autoPruneEnabled, handleToggleAutoPrune, autoPruneLimit, handleManualPruneNow, isPruningImages, totalMarketingBytes, handleSelectAllImages, selectedImageFilenames, handleBatchDeleteSelectedImages, fetchMarketingImages, setImageViewMode, imageViewMode, filteredMarketingImages, currentPageClamped, totalImagePages, paginatedMarketingImages, handleToggleSelectImage, setSelectedImageFilenames)
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-sm text-slate-500">
        <p className="tracking-wide">CoinMarketCap Automated Community Bot Control Panel © 2026. All rights reserved.</p>
      </footer>

      {/* MODAL: PASTE COOKIE SESSION OR LOGIN */}
      {renderSessionAccountModal(status, isContinuousLoopActive, switchingProfileId, sessionJson, setSessionJson, showSessionModal, setShowSessionModal, profilesList, newProfileName, setNewProfileName, newProfileLimit, setNewProfileLimit, newProfileProxy, setNewProfileProxy, editingLimitProfileId, setEditingLimitProfileId, editingLimitValue, setEditingLimitValue, editingProxyProfileId, setEditingProxyProfileId, editingProxyValue, setEditingProxyValue, dailyPostLimit, deletingId, setDeletingId, showToast, loginTab, setLoginTab, email, setEmail, password, setPassword, loginStep, setLoginStep, otpCode, setOtpCode, loginStatusMessage, setLoginStatusMessage, isPostingActive, isBusy, fetchSessionDetails, fetchProfiles, handleSaveProfile, handleUpdateProfileLimit, handleUpdateProfileProxy, promptSwitchProfile, handleDeleteProfile, handleSaveSession, handleStartLogin, handleSubmitOtp, handleCancelLogin, handleResetLoginState)}
      {renderModalsLayer(results, coinsFetchedAt, commentsGeneratedAt, isContinuousLoopActive, switchingProfileId, setIsStartingPost, showConfirmFetchModal, setShowConfirmFetchModal, showConfirmGenerateModal, setShowConfirmGenerateModal, showStaleWarningModal, setShowStaleWarningModal, isRefreshingFreshData, activeProfile, toast, inlineConfirmModal, setInlineConfirmModal, showToast, dismissToast, toggleNotifications, isResettingDailyQueue, showResetQueueConfirm, setShowResetQueueConfirm, handleResetDailyQueue, isPruningData, retentionDays, showRetentionSettingsModal, setShowRetentionSettingsModal, handlePruneOldData, handleSaveRetentionSettings, confirmSwitchProfile, setConfirmSwitchProfile, isPostingActive, isBusy, isSchedulerRunning, handleActivateProfile, runCommand, handleRefreshFreshData)}
    </div>
  );
}
