import { useState, useEffect, useRef } from "react";
import { api, apiFetch } from "../api";
import type { PostResult, LogEntry } from "../types";
import {
  resolveUrl,
  parseResponseJson,
  areLogsEqual,
  areCoinsEqual,
  areMessagesEqual,
  areResultsEqual,
  areProfilesEqual,
} from "../utils/ui-helpers";

export function useDashboardPolling(status: any, setStatus: any, setRunMode: any, setTotalCoins: any, setGeneratedCount: any, setPostedCount: any, setFailedCount: any, results: any, setResults: any, setProgressIndex: any, currentCoin: any, setCurrentCoin: any, setCoinsFetchedAt: any, setCommentsGeneratedAt: any, setSessionStatus: any, setApiStatus: any, setStorageInfo: any, isContinuousLoopActive: any, setIsContinuousLoopActive: any, setNextCycleStartTime: any, setContinuousInterval: any, isInitialIntervalLoaded: any, setActiveProcess: any, setActiveProcessDescription: any, setHealthData: any, logsTab: any, setImageUploadEnabled: any, setImageSelectionMode: any, setActiveImageIndex: any, marketingImages: any, setMarketingImages: any, previewModalImage: any, setPreviewModalImage: any, setAutoPruneEnabled: any, setAutoPruneLimit: any, setIsStartingPost: any, setIsStoppingPost: any, setSessionExists: any, setSessionDetails: any, setActiveSessionContent: any, setIsDataStale: any, setProfilesList: any, setDailyPostCount: any, setDailyPostLimit: any, setLastPostDate: any, activeProfile: any, setActiveProfile: any, activeProfileIdRef: any, currentView: any, setTargetCoinsCount: any, setLoginStep: any, setLoginStatusMessage: any, logsList: any, setLogsList: any, setSchedulerLogsList: any, activeTab: any, setCoinsList: any, messagesList: any, setMessagesList: any, systemCheckResult: any, setSystemCheckResult: any, isCheckingSystem: any, setIsCheckingSystem: any, setSchedulerData: any, setSchedulerIntervalInput: any) {
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

  // Initial mount hydration (no cross-page background polling while dashboard is open)
  useEffect(() => {
    fetchProfiles();
    fetchSessionDetails();
    fetchStats();
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
        if (data.schedulerSummary) {
          setSchedulerData((prev: any) => prev ? { ...prev, ...data.schedulerSummary } : data.schedulerSummary);
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

  return [fetchSchedulerStatus, fetchMarketingImages, autoScroll, setAutoScroll, terminalContainerRef, terminalEndRef, lastRequestTimestamp, fetchCoins, fetchMessages, fetchResults, fetchLogs, fetchSessionDetails, fetchProfiles, fetchStats, checkSystemHealth] as const;
}
