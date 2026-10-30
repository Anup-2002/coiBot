import { path, initialOutputDir, initialAuthDir, type LogEntry, type SystemProcessType, type LoginSession } from "./config.ts";

export const st = {
  OUTPUT_DIR: initialOutputDir,
  AUTH_DIR: initialAuthDir,
  LAST_TRENDING_FILE: path.join(initialOutputDir, "last_trending.json"),
  GENERATED_MESSAGES_FILE: path.join(initialOutputDir, "generated_messages.json"),
  RESULTS_FILE: path.join(initialOutputDir, "results.json"),
  POST_PROGRESS_FILE: path.join(initialOutputDir, "post_progress.json"),
  TIMESTAMPS_FILE: path.join(initialOutputDir, "timestamps.json"),
  AUTH_STATE_FILE: path.join(initialAuthDir, "state.json"),
  PROFILES_FILE: path.join(initialAuthDir, "profiles.json"),
  SETTINGS_FILE: path.join(initialAuthDir, "settings.json"),
  SCHEDULER_LOG_FILE: path.join(initialOutputDir, "scheduler.log"),
  MARKETING_IMAGES_DIR: path.join(initialOutputDir, "marketing_images"),

  logs: [] as LogEntry[],
  schedulerLogsBuffer: [] as LogEntry[],
  logSyncTimeout: null as NodeJS.Timeout | null,
  isInstallingPlaywright: false,

  botStatus: "Idle",
  currentCoinName: "N/A",
  activePostingTimeout: null as NodeJS.Timeout | null,
  currentPostingIndex: 0,
  isPostingRunning: false,
  isSinglePostingRunning: false,
  isSingleStopping: false,
  isGeneratingRunning: false,
  isStopping: false,
  runMode: "Real Browser",

  activeSystemProcess: "none" as SystemProcessType,
  activeProcessDetails: "",
  activeProcessStartTime: 0,

  lastOpenAiError: null as string | null,
  lastGeminiError: null as string | null,

  isContinuousLoopActive: false,
  isFullFlowAborted: false,
  nextCycleStartTime: null as number | null,
  nextCycleTimeout: null as NodeJS.Timeout | null,
  continuousLoopIntervalMinutes: 20,

  activeLoginSession: null as LoginSession | null,
  loginState: {
    status: "idle" as "idle" | "authenticating" | "requires_otp" | "success" | "failed" | "captcha",
    message: "",
  },

  isSchedulerCycleRunning: false,
  currentSchedulerAccountId: null as string | null,
  schedulerQueue: [] as string[],
  stopSchedulerRequested: false,
  pauseSchedulerRequested: false,
  stopSchedulerForceTimer: null as NodeJS.Timeout | null,
  activePostingBrowser: null as any,
  activePostingPage: null as any,

  lastCloudSavedHash: new Map<string, string>(),
  hydratedProfiles: new Set<string>(),
  lastCloudSyncTime: 0,

  lastTelegramAlertTimes: new Map<string, number>(),
  globalTelegramTimestamps: [] as number[],

  cachedHealthResponse: null as any,
  cachedHealthAt: 0,
  cachedSystemCheckResult: null as any,
  cachedSystemCheckAt: 0,

  activeProfileRunLocks: new Set<string>(),
  activeAdminSessions: new Set<string>(),

  schedulerCycleIntervalMinutes: 360,
  schedulerCycleTimeout: null as NodeJS.Timeout | null,
  nextSchedulerCycleStartTime: null as number | null,
  lastSchedulerCycleStartTime: null as number | null,

  syncLocalFromCloudHook: null as ((force?: boolean) => Promise<void>) | null,
};

export const state = st;
