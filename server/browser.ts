import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { chromium } from "./config.ts";
import { st, getActiveProfile, addLog } from "./state.ts";

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export async function installPlaywrightChromium(): Promise<void> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return;
  }
  if (st.isInstallingPlaywright) {
    while (st.isInstallingPlaywright) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return;
  }
  st.isInstallingPlaywright = true;
  try {
    const targetBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.cwd(), ".cache", "ms-playwright");
    const childEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: targetBrowserPath };

    addLog("info", `Executing command: PLAYWRIGHT_BROWSERS_PATH=${targetBrowserPath} npx playwright install chromium`);
    execSync(`npx playwright install chromium`, { env: childEnv, stdio: "inherit", cwd: process.cwd() });
    addLog("success", "Playwright chromium browser successfully installed!");
  } catch (err) {
    addLog("error", `Failed to automatically run playwright install: ${(err as Error).message}`);
  } finally {
    st.isInstallingPlaywright = false;
  }
}

export class PlaywrightLock {
  private static queue: Promise<any> = Promise.resolve();

  static async acquire<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.queue.then(async () => {
      return await task();
    });
    this.queue = nextTask.catch(() => {});
    return nextTask;
  }
}

export async function launchBrowserResilient(options: any = {}): Promise<any> {
  // Inject highly aggressive memory-saving flags suitable for low-RAM containers like Render (512MB limit)
  const memoryArgs = [
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-setuid-sandbox",
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-extensions",
    "--disable-sync",
    "--disable-default-apps",
    "--mute-audio",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--disable-blink-features=AutomationControlled",
    "--no-zygote",
    "--disable-software-rasterizer",
    '--js-flags="--max-old-space-size=128"'
  ];

  if (!options.args) {
    options.args = [];
  }
  for (const arg of memoryArgs) {
    if (!options.args.includes(arg)) {
      options.args.push(arg);
    }
  }

  if (options.chromiumSandbox === undefined) {
    options.chromiumSandbox = false;
  }
  if (options.headless === undefined) {
    options.headless = true;
  }

  // Support optional per-profile or environment proxy (native Playwright)
  if (!options.proxy) {
    const activeProf = getActiveProfile();
    const proxyStr = activeProf?.proxy || process.env.DEFAULT_PROXY;
    if (proxyStr && typeof proxyStr === "string" && proxyStr.trim()) {
      try {
        const trimmed = proxyStr.trim();
        const hasProto = trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("socks5://") || trimmed.startsWith("socks4://");
        const url = new URL(hasProto ? trimmed : `http://${trimmed}`);
        options.proxy = {
          server: `${url.protocol}//${url.host}`,
        };
        if (url.username) {
          options.proxy.username = decodeURIComponent(url.username);
        }
        if (url.password) {
          options.proxy.password = decodeURIComponent(url.password);
        }
        console.log(`[PLAYWRIGHT] Using proxy for account "${activeProf?.name || activeProf?.id || "active"}": ${options.proxy.server}`);
      } catch (proxyErr) {
        console.warn(`[PLAYWRIGHT] Could not parse proxy string "${proxyStr}": ${(proxyErr as Error).message}`);
      }
    }
  }

  try {
    // Wrap chromium launch in a 30s timeout so hangs are caught and handled
    return await withTimeout(
      chromium.launch(options),
      30000,
      "Chromium launch timed out after 30 seconds"
    );
  } catch (err) {
    const errMsg = (err as Error).message;
    if (
      errMsg.includes("shared libraries") ||
      errMsg.includes("cannot open shared object file") ||
      errMsg.includes("libglib-2.0.so") ||
      errMsg.includes("exitCode=127")
    ) {
      throw new Error(
        "Playwright requires missing system shared libraries (like libglib-2.0.so.0) which are not pre-installed in this environment (root/sudo access is required to install them). However, these packages are fully configured to be installed automatically in production/AWS/Railway environments via our nixpacks.toml/railway.toml configurations!"
      );
    }
    if (
      errMsg.includes("Executable doesn't exist") || 
      errMsg.includes("playwright install") || 
      errMsg.includes("Looks like Playwright was just installed or updated") ||
      errMsg.includes("timed out")
    ) {
      addLog("warning", `Playwright browser launch failed or timed out: ${errMsg}. Re-installing chromium and setting up system dependencies...`);
      await installPlaywrightChromium();
      
      // Try again on second attempt with a slightly longer timeout
      return await withTimeout(
        chromium.launch(options),
        45000,
        "Chromium launch timed out after 45 seconds on second attempt"
      );
    }
    throw err;
  }
}

export async function saveDebugScreenshot(page: any, name: string) {
  // Screenshot capture disabled to optimize CPU, memory, and disk space usage
}

// Robust click helper to prevent timeouts on elements blocked by overlays or slow actionability checks
export async function removeBlockingOverlays(page: any) {
  try {
    await page.evaluate(() => {
      const selectors = [
        '.modal-backdrop',
        '.modalOpened',
        '[class*="backdrop" i]',
        '[class*="overlay" i]',
        '[class*="modalOpened" i]',
        '[class*="dialog-container" i]',
        '.sc-acb6320-0',
        '.jPvGvf',
        '#onetrust-banner-sdk',
        '#onetrust-accept-btn-handler',
        '.optanon-allow-all',
        '#accept-cookie-policy',
        '.cmc-cookie-policy-banner__close',
        '.cmc-cookie-policy-banner',
        '[id*="cookie" i]',
        '[class*="cookie" i]'
      ];
      for (const sel of selectors) {
        try {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            el.remove();
          });
        } catch {}
      }
      if (document.body) {
        document.body.style.overflow = "auto";
        document.body.style.pointerEvents = "auto";
      }
    }).catch(() => {});
  } catch {}
}

export async function clickResiliently(page: any, element: any, selectorDescription: string) {
  try {
    // Purge any blocking overlays/modals before attempting clicks
    await removeBlockingOverlays(page).catch(() => {});

    // Try to scroll the element into view first so actionability is easier to pass
    await element.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    
    // Attempt normal click with a short timeout of 500ms so it doesn't hang
    await element.click({ timeout: 500 });
  } catch (err) {
    addLog("warning", `Standard click failed on ${selectorDescription}: ${(err as Error).message}. Trying forced click fallback...`);
    try {
      // Attempt click with force: true and 500ms timeout
      await element.click({ force: true, timeout: 500 });
    } catch (err2) {
      addLog("warning", `Forced click failed on ${selectorDescription}: ${(err2 as Error).message}. Using dispatchEvent click fallback...`);
      // Fallback to dispatchEvent click (bypasses all visibility, hover, and actionability checks)
      await element.dispatchEvent("click").catch(async (err3) => {
        addLog("warning", `dispatchEvent click failed on ${selectorDescription}: ${(err3 as Error).message}. Trying evaluate click fallback...`);
        // Final fail-safe: evaluate element.click() in browser context
        await element.evaluate((el: any) => (el as HTMLElement).click()).catch((err4) => {
          addLog("error", `All click attempts failed on ${selectorDescription}: ${(err4 as Error).message}`);
          throw err4;
        });
      });
    }
  }
}

export async function fillInputResiliently(page: any, input: any, value: string) {
  try {
    await input.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await input.click({ timeout: 2000 }).catch(() => {});
    await input.focus().catch(() => {});
    
    // Clear any existing text
    await input.fill("").catch(() => {});
    
    // Use fill
    await input.fill(value).catch(() => {});
    
    // Double-check if the value matches. If not, use keyboard.type
    const currentVal = await input.inputValue().catch(() => "");
    if (currentVal !== value) {
      await input.focus().catch(() => {});
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await page.keyboard.type(value, { delay: 30 }).catch(() => {});
    }
    
    // Dispatch 'input' and 'change' events via evaluate to absolutely force React state update
    await input.evaluate((el: HTMLInputElement, val: string) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value).catch(() => {});
  } catch (err) {
    addLog("warning", `Error during resilient fill: ${(err as Error).message}`);
  }
}

// Humanized typing simulation with natural micro-jitter, space pauses, and punctuation rhythm
// Guarantees absence of flat-delay bot signatures detected by WAFs / anti-bot suites
export async function typeWithHumanRhythm(page: any, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await page.keyboard.type(char);

    // Realistic human keystroke interval (35ms - 75ms)
    let charDelay = 35 + Math.floor(Math.random() * 45);

    // Natural pauses:
    // Punctuation pause (commas, periods, questions): human thought rhythm
    if (char === '.' || char === '!' || char === '?') {
      charDelay += 180 + Math.floor(Math.random() * 220);
    } else if (char === ',' || char === ';' || char === ':') {
      charDelay += 100 + Math.floor(Math.random() * 120);
    } else if (char === ' ') {
      charDelay += 40 + Math.floor(Math.random() * 60);
    }

    // Micro-jitter: 5% chance of slight cognitive hesitation (120-220ms)
    if (Math.random() < 0.05) {
      charDelay += 120 + Math.floor(Math.random() * 100);
    }

    await page.waitForTimeout(charDelay);
  }
}

export async function locateAndPrepareCommentEditor(page: any): Promise<any> {
  // 1. Purge all blocking overlays/cookie banners immediately via extremely fast DOM script
  await removeBlockingOverlays(page).catch(() => {});

  // Robust combined CSS selector covering all possible variants of the editor
  const robustSelector = 'div[contenteditable="true"], [data-test="base-editor-editable"], .public-DraftEditor-content, textarea[placeholder*="thoughts" i], textarea[placeholder*="comment" i], [placeholder*="thoughts" i], [placeholder*="comment" i], [role="textbox"]';

  // 2. CHECK IF EDITOR IS ALREADY VISIBLE. If yes, return immediately!
  try {
    const el = await page.$(robustSelector);
    if (el && await el.isVisible()) {
      addLog("info", "Comment editor is already visible on initial page load. Skipping tab activation and scrolling!");
      return el;
    }
  } catch {}

  // 3. If not visible, check and click the Community/Social/Discussion tab
  addLog("info", "Comment editor not immediately visible. Activating Community/Social section tab...");
  const communityTabs = [
    'a:has-text("Community")',
    'button:has-text("Community")',
    'span:has-text("Community")',
    'a:has-text("Social")',
    'button:has-text("Social")',
    'span:has-text("Social")',
    'a:has-text("Discussion")',
    'button:has-text("Discussion")',
    'span:has-text("Discussion")',
    'a:has-text("Feed")',
    'button:has-text("Feed")',
    'span:has-text("Feed")',
    '[data-test="community-tab"]'
  ];
  for (const selector of communityTabs) {
    try {
      const tab = await page.$(selector);
      if (tab && await tab.isVisible()) {
        addLog("info", `Clicking tab trigger to activate community section: "${selector}"`);
        await clickResiliently(page, tab, `community tab button: ${selector}`);
        await page.waitForTimeout(1000);
        
        // Dynamic verification: check if editor became visible after clicking this tab
        const el = await page.$(robustSelector);
        if (el && await el.isVisible()) {
          addLog("success", `Comment editor became visible after clicking tab "${selector}"! Skipping remaining tabs/scrolls.`);
          return el;
        }
      }
    } catch {}
  }

  // 4. Scroll down in incremental steps to trigger lazy loading of comments / editor section
  addLog("info", "Executing incremental scrolling loops to trigger CoinMarketCap lazy loaders...");
  for (let step = 1; step <= 6; step++) {
    try {
      const el = await page.$(robustSelector);
      if (el && await el.isVisible()) {
        addLog("success", `Successfully found comment editor during scroll-step ${step}!`);
        return el;
      }
    } catch {}

    const scrollAmount = 700;
    addLog("info", `Scroll-step ${step}/6: Scrolling page down by ${scrollAmount}px...`);
    await page.evaluate((amt: number) => window.scrollBy(0, amt), scrollAmount).catch(() => {});
    await page.waitForTimeout(1200); // Allow lazy components to fetch and load
  }

  // 5. Use a final, highly efficient wait-for-selector strategy
  try {
    addLog("info", "Waiting for comment editor to load using our robust selector strategy...");
    const editor = await page.waitForSelector(robustSelector, { state: "visible", timeout: 6000 });
    if (editor) {
      addLog("success", "Successfully located comment editor using robust selector!");
      return editor;
    }
  } catch (err) {
    addLog("warning", `Comment editor not visible via main selector: ${(err as Error).message}`);
  }

  // 5.5. Heuristic DOM element scanner fallback (Frontend Redesign & Class Obfuscation Protection)
  try {
    addLog("info", "Executing heuristic DOM element scanner fallback for comment editor...");
    const fallbackEditorHandle = await page.evaluateHandle(() => {
      // 1. Check all elements with contenteditable="true" or role="textbox"
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [role="textbox"], textarea'));
      for (const el of editables) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 50 && rect.height > 20 && style.visibility !== "hidden" && style.display !== "none") {
          return el;
        }
      }
      // 2. Check for inputs inside containers mentioning comments/thoughts/discussion/feed
      const containers = Array.from(document.querySelectorAll('div, section, article, form, [class*="community" i]'));
      for (const c of containers) {
        const text = (c as HTMLElement).innerText || "";
        const lower = text.toLowerCase();
        if (lower.includes("share your thoughts") || lower.includes("write a comment") || lower.includes("leave a comment") || lower.includes("join discussion")) {
          const input = c.querySelector('textarea, div[contenteditable], [role="textbox"], input[type="text"]');
          if (input) return input;
        }
      }
      return null;
    });

    const el = fallbackEditorHandle?.asElement();
    if (el) {
      const isVisible = await el.isVisible().catch(() => false);
      if (isVisible) {
        addLog("success", "Successfully located comment editor using heuristic DOM scanner fallback!");
        return el;
      }
    }
  } catch (heurErr) {
    addLog("warning", `Heuristic editor search warning: ${(heurErr as Error).message}`);
  }

  // 6. Check frames as a fallback
  try {
    for (const frame of page.frames()) {
      const frameEl = await frame.$(robustSelector);
      if (frameEl && await frameEl.isVisible()) {
        addLog("info", "Located comment editor inside frame.");
        return frameEl;
      }
    }
  } catch {}

  return null;
}

export async function setupPageResourceBlocking(page: any): Promise<void> {
  try {
    await page.route("**/*", async (route: any) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      // Minimum safe optimization: only block heavy media (video/audio) and third-party trackers.
      // KEEP images and fonts enabled so login captchas, slide puzzles, and UI buttons render properly!
      const blockedTypes = ["media"];
      const blockedDomains = [
        "google-analytics.com",
        "googletagmanager.com",
        "doubleclick.net",
        "facebook.net",
        "hotjar.com",
        "clarity.ms",
        "scorecardresearch.com"
      ];
      
      const shouldBlock = blockedTypes.includes(resourceType) || 
                          blockedDomains.some(domain => url.includes(domain));
                          
      if (shouldBlock) {
        await route.abort().catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    });
  } catch (err) {
    console.error("Resource routing error:", err);
  }
}

export function extractFingerprintDetails(stateFilePath: string) {
  let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  let timezoneId = "America/New_York";
  let locale = "en-US";

  try {
    if (fs.existsSync(stateFilePath)) {
      const state = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      
      let bncFvInfoStr = "";
      
      // Check cookies
      if (Array.isArray(state.cookies)) {
        const cookie = state.cookies.find((c: any) => c.name === "BNC_FV_INFO" || c.name === "__BNC_FP_INFO__");
        if (cookie && cookie.value) {
          bncFvInfoStr = decodeURIComponent(cookie.value);
        }
      }
      
      // Check localStorage if not found in cookies
      if (!bncFvInfoStr && Array.isArray(state.origins)) {
        for (const origin of state.origins) {
          if (Array.isArray(origin.localStorage)) {
            const item = origin.localStorage.find((l: any) => l.name === "BNC_FV_INFO" || l.name === "__BNC_FP_INFO__" || l.name === "BNC_FV_KEY");
            if (item && item.value) {
              bncFvInfoStr = item.value;
            }
          }
        }
      }
      
      if (bncFvInfoStr) {
        let parsedInfo: any = null;
        try {
          const outer = JSON.parse(bncFvInfoStr);
          if (outer && typeof outer === "object" && typeof outer.value === "string") {
            parsedInfo = JSON.parse(outer.value);
          } else {
            parsedInfo = outer;
          }
        } catch {
          try {
            parsedInfo = JSON.parse(bncFvInfoStr);
          } catch {}
        }
        
        if (parsedInfo && typeof parsedInfo === "object") {
          if (parsedInfo.ua) {
            userAgent = parsedInfo.ua;
          } else if (parsedInfo.user_agent) {
            userAgent = parsedInfo.user_agent;
          }
          
          if (parsedInfo.webTimezone) {
            timezoneId = parsedInfo.webTimezone;
          } else if (parsedInfo.web_timezone) {
            timezoneId = parsedInfo.web_timezone;
          }
          
          if (parsedInfo.sysLanguage) {
            locale = parsedInfo.sysLanguage;
          } else if (parsedInfo.system_lang) {
            locale = parsedInfo.system_lang;
          }
        }
      }
    }
  } catch (err) {
    console.error("Error extracting fingerprint details from storage state:", (err as Error).message);
  }

  return { userAgent, timezoneId, locale };
}

export function hasRealAuthCookies(cookies: any[]): boolean {
  if (!Array.isArray(cookies) || cookies.length === 0) return false;
  return cookies.some((c: any) => {
    const n = (c.name || "").trim().toLowerCase();
    const v = (c.value || "").trim();
    // Genuine JWT token or Bearer authorization header cookie
    if (n === "authorization" && (v.startsWith("Bearer ") || v.startsWith("eyJ") || v.length > 30)) return true;
    if (n === "cmc_user_session" && v.length > 15) return true;
    if ((n === "token" || n === "access_token" || n === "auth_token") && (v.startsWith("eyJ") || v.length > 40)) return true;
    return false;
  });
}

export async function isEditorPostButtonRequiringLogin(page: any): Promise<boolean> {
  try {
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button'
    ];
    for (const sel of postButtonSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        const text = (await btn.innerText().catch(() => "")).trim().toLowerCase();
        if (text.includes("log in") || text.includes("login") || text.includes("sign in") || text.includes("signin")) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}
