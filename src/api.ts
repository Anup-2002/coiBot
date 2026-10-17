// Typed API client for CoinMarketCap Bot backend

export interface ApiStatusResponse {
  status: string;
  isPosting: boolean;
  isStopping?: boolean;
  isGenerating?: boolean;
  isContinuousLoopActive: boolean;
  nextCycleStartTime: number | null;
  continuousLoopIntervalMinutes: number;
  totalCoins: number;
  totalGenerated: number;
  totalSubmitted: number;
  totalSuccess: number;
  totalFailed: number;
  dailyPostCount?: number;
  dailyPostLimit?: number;
  lastPostDate?: string;
  successRate: string;
  currentCoin: string;
  runMode: string;
  activeProfileId?: string | null;
  activeProfileName?: string | null;
  coinsFetchedAt?: number | null;
  commentsGeneratedAt?: number | null;
  coinsFetchedTime?: string | null;
  commentsGeneratedTime?: string | null;
  apiKeys: {
    openai: boolean;
    gemini: boolean;
    cmc: boolean;
    openaiError?: string | null;
    geminiError?: string | null;
  };
  sessionStatus?: string;
  imageUploadEnabled?: boolean;
  imageSelectionMode?: "cycle" | "random";
  activeImageIndex?: number;
  availableImagesCount?: number;
}

export interface MarketingImage {
  filename: string;
  url: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  stateJson?: string;
  isActive?: boolean;
  email?: string;
  dailyPostLimit?: number;
  updatedAt?: string;
}

export const api = {
  async getStatus(): Promise<ApiStatusResponse> {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error(`Status error: ${res.status}`);
    return res.json();
  },

  async getProfiles(): Promise<{ success: boolean; profiles: Profile[] }> {
    const res = await fetch("/api/profiles");
    return res.json();
  },

  async activateProfile(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch("/api/activate-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.json();
  },

  async saveProfile(profile: Partial<Profile>): Promise<{ success: boolean; profile?: Profile; error?: string }> {
    const res = await fetch("/api/save-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    return res.json();
  },

  async deleteProfile(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch("/api/delete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.json();
  },

  async clearSession(): Promise<{ success: boolean; error?: string }> {
    const res = await fetch("/api/clear-session", { method: "POST" });
    return res.json();
  },

  async updateProfileLimit(id: string, dailyPostLimit: number): Promise<{ success: boolean; profile?: Profile; dailyPostLimit?: number; error?: string }> {
    const res = await fetch("/api/update-profile-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dailyPostLimit }),
    });
    return res.json();
  },

  async setContinuousLoop(active?: boolean, intervalMinutes?: number): Promise<any> {
    const res = await fetch("/api/set-continuous-loop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, intervalMinutes }),
    });
    return res.json();
  },

  async retrySingle(symbol: string): Promise<any> {
    const res = await fetch("/api/retry-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    return res.json();
  },

  async checkSystem(): Promise<any> {
    const res = await fetch("/api/check-system");
    return res.json();
  },

  async getScheduler(): Promise<SchedulerStatusResponse> {
    const res = await fetch("/api/scheduler");
    if (!res.ok) throw new Error(`Scheduler error: ${res.status}`);
    return res.json();
  },

  async setSchedulerSettings(params: { enabled?: boolean; intervalMinutes?: number } | boolean): Promise<{ success: boolean; enabled: boolean; intervalMinutes?: number; error?: string }> {
    const payload: { enabled?: boolean; intervalMinutes?: number } = {};
    if (typeof params === "boolean") {
      payload.enabled = params;
    } else if (params && typeof params === "object") {
      if (typeof params.enabled === "boolean") payload.enabled = params.enabled;
      if (typeof params.intervalMinutes === "number" && !isNaN(params.intervalMinutes)) {
        payload.intervalMinutes = Math.round(params.intervalMinutes);
      }
    }
    const res = await fetch("/api/scheduler/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async updateProfileSchedule(params: {
    id: string;
    enabled?: boolean;
    frequency?: "every_cycle" | "daily" | "weekly" | "custom";
    customHours?: number;
    order?: number;
    useForNow?: boolean;
  }): Promise<{ success: boolean; profile?: any; error?: string }> {
    const payload: Record<string, any> = { id: String(params.id) };
    if (typeof params.enabled === "boolean") payload.enabled = params.enabled;
    if (typeof params.frequency === "string") payload.frequency = params.frequency;
    if (typeof params.customHours === "number" && !isNaN(params.customHours)) payload.customHours = params.customHours;
    if (typeof params.order === "number" && !isNaN(params.order)) payload.order = params.order;
    if (typeof params.useForNow === "boolean") payload.useForNow = params.useForNow;

    const res = await fetch("/api/profile-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async reorderSchedulerAccounts(orderedIds: string[]): Promise<{ success: boolean; profiles?: any[]; error?: string }> {
    const cleanIds = Array.isArray(orderedIds) ? orderedIds.map(id => String(id)) : [];
    const res = await fetch("/api/scheduler/reorder-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: cleanIds }),
    });
    return res.json();
  },

  async getSchedulerFilesInfo(): Promise<{ success: boolean; files: SchedulerFileInfo[] }> {
    const res = await fetch("/api/scheduler/files-info");
    if (!res.ok) throw new Error(`Files info error: ${res.status}`);
    return res.json();
  },

  async getSchedulerFileContent(key: string): Promise<{ success: boolean; exists: boolean; path?: string; content?: string | null; error?: string }> {
    const res = await fetch(`/api/scheduler/file-content?key=${encodeURIComponent(key)}`);
    return res.json();
  },

  async getSchedulerLogs(): Promise<{ success: boolean; logs: { timestamp: string; level: "info" | "success" | "warning" | "error"; message: string }[] }> {
    const res = await fetch("/api/scheduler/logs");
    return res.json();
  },

  async runSchedulerNow(): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch("/api/scheduler/run-now", {
      method: "POST",
    });
    return res.json();
  },

  async stopScheduler(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch("/api/scheduler/stop", {
      method: "POST",
    });
    return res.json();
  },

  async stopPosting(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch("/api/stop-posting", {
      method: "POST",
    });
    return res.json();
  },

  async getMarketingImages(): Promise<{ success: boolean; images: MarketingImage[]; imageUploadEnabled: boolean; imageSelectionMode: "cycle" | "random"; activeImageIndex: number }> {
    const res = await fetch("/api/marketing-images");
    if (!res.ok) throw new Error(`Images error: ${res.status}`);
    return res.json();
  },

  async setImageSettings(params: {
    enabled?: boolean;
    mode?: "cycle" | "random";
    autoPruneEnabled?: boolean;
    autoPruneLimit?: number;
  }): Promise<{
    success: boolean;
    imageUploadEnabled: boolean;
    imageSelectionMode: "cycle" | "random";
    autoPruneEnabled?: boolean;
    autoPruneLimit?: number;
    error?: string;
  }> {
    const res = await fetch("/api/settings/image-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async deleteMarketingImage(filename: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/marketing-images?filename=${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    return res.json();
  },

  async uploadMarketingImages(
    files: Array<{ filename: string; base64: string }>,
    replaceExisting: boolean = false,
    autoPruneLimit?: number
  ): Promise<{ success: boolean; uploadedCount?: number; error?: string }> {
    const res = await fetch("/api/marketing-images/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, replaceExisting, autoPruneLimit }),
    });
    return res.json();
  },

  async importExternalImages(params: {
    links: string;
    replaceExisting?: boolean;
  }): Promise<{
    success: boolean;
    importedCount?: number;
    errors?: string[];
    message?: string;
    error?: string;
  }> {
    const res = await fetch("/api/marketing-images/import-external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async batchDeleteMarketingImages(filenames: string[]): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
    const res = await fetch("/api/marketing-images/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames }),
    });
    return res.json();
  },

  async autoPruneMarketingImages(keepCount: number): Promise<{ success: boolean; prunedCount?: number; remainingCount?: number; message?: string; error?: string }> {
    const res = await fetch("/api/marketing-images/auto-prune", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepCount }),
    });
    return res.json();
  },

  async clearAllMarketingImages(): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch("/api/marketing-images/clear-all", {
      method: "POST",
    });
    return res.json();
  },

  async resetDailyQueue(): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch("/api/queue/reset-daily", {
      method: "POST",
    });
    return res.json();
  },

  async verifyAllFleetSessions(): Promise<{
    success: boolean;
    totalAccounts: number;
    healthyCount: number;
    expiredCount: number;
    accounts: Array<{
      id: string;
      name: string;
      status: "valid" | "expired" | "missing_cookies";
      message: string;
      order: number;
      frequency: string;
    }>;
    checkedAt: string;
    error?: string;
  }> {
    const res = await fetch("/api/profiles/verify-all", {
      method: "POST",
    });
    return res.json();
  },

  async updateTargetCoins(targetCoinsCount: number): Promise<{ success: boolean; targetCoinsCount: number; error?: string }> {
    const res = await fetch("/api/settings/target-coins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCoinsCount }),
    });
    return res.json();
  },
};

export interface SchedulerFileInfo {
  key: string;
  name: string;
  path: string;
  description: string;
  exists: boolean;
  sizeBytes: number;
  itemCount?: number;
  updatedAt: string | null;
}

export interface SchedulerAccountItem {
  id: string;
  name: string;
  schedule: {
    enabled: boolean;
    frequency: "every_cycle" | "daily" | "weekly" | "custom";
    customHours?: number;
    order: number;
    useForNow?: boolean;
  };
  lastRun: {
    at: string | null;
    status: string | null;
    posted: number;
    failed: number;
  };
  nextDueAt: string | null;
  hasValidSession: boolean;
}

export interface SchedulerStatusResponse {
  enabled: boolean;
  intervalMinutes: number;
  cycleRunning: boolean;
  currentAccountId: string | null;
  queue: string[];
  accounts: SchedulerAccountItem[];
  targetCoinsCount?: number;
}

