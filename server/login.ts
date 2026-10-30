import { fs, path } from "./config.ts";
import { st, addLog, getActiveProfileId, normalizeStateJson, sessionHasValidCookies } from "./state.ts";
import { saveSessionStateCloudIfChanged, autoSyncSessionToProfiles } from "./sync.ts";
import { saveSessionStateCloud } from "../src/storage.ts";
import {
  withTimeout,
  PlaywrightLock,
  launchBrowserResilient,
  saveDebugScreenshot,
  removeBlockingOverlays,
  clickResiliently,
  fillInputResiliently,
  locateAndPrepareCommentEditor,
  setupPageResourceBlocking,
  extractFingerprintDetails,
  hasRealAuthCookies,
  isEditorPostButtonRequiringLogin,
} from "./browser.ts";

export async function checkLoginRealInternal(): Promise<{ status: "success" | "expired" | "captcha" | "failed"; message: string }> {
  // Pre-flight check: If auth/state.json doesn't exist or has no valid session cookies, return immediately without launching browser
  if (!fs.existsSync(st.AUTH_STATE_FILE)) {
    return { status: "expired", message: "No session state file found" };
  }
  try {
    const rawContent = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
    if (!sessionHasValidCookies(rawContent)) {
      return { status: "expired", message: "Session cookies missing or expired in auth state" };
    }
  } catch (_) {
    return { status: "expired", message: "Malformed session state file" };
  }

  addLog("info", "Playwright launching headlessly with stealth configurations...");
  let browser: any = null;
  try {
    browser = await launchBrowserResilient({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ]
    });
    
    // Extract fingerprint details from user's state.json to maximize session authenticity
    const { userAgent, timezoneId, locale } = extractFingerprintDetails(st.AUTH_STATE_FILE);
    
    addLog("info", `Loading browser context storage state from auth/state.json with fingerprint settings (User-Agent: ${userAgent.substring(0, 40)}..., Timezone: ${timezoneId}, Locale: ${locale})...`);
    const context = await browser.newContext({
      storageState: st.AUTH_STATE_FILE,
      userAgent,
      viewport: { width: 1366, height: 768 },
      locale,
      timezoneId,
    });

    // Stealth: hide webdriver property
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();
    await setupPageResourceBlocking(page);
    addLog("info", "Navigating to CoinMarketCap Bitcoin page: https://coinmarketcap.com/currencies/bitcoin/");
    
    try {
      await page.goto("https://coinmarketcap.com/currencies/bitcoin/", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
    } catch (gotoErr) {
      addLog("warning", `Initial page navigation timeout/warning (continuing anyway to check elements): ${(gotoErr as Error).message}`);
    }
    
    // Wait for the page to settle down
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/signin") || currentUrl.includes("/auth")) {
      addLog("error", `Session expired: Redirected to login page (${currentUrl})`);
      await saveDebugScreenshot(page, "login_expired");
      return { status: "expired", message: "Session expired: Redirected to login page" };
    }
    
    // Also check if any header Log In buttons are visible on the page
    let isHeaderLoginVisible = false;
    const headerLoginSelectors = [
      'button:has-text("Log In")',
      'button:has-text("Log in")',
      'a:has-text("Log In")',
      'a:has-text("Log in")',
      '[data-testid="header-login-button"]'
    ];
    for (const sel of headerLoginSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          isHeaderLoginVisible = true;
          break;
        }
      } catch {}
    }

    // 1. Cookie Check: We check if core authorization cookies are present in the context.
    const cookies = await context.cookies().catch(() => []);
    const hasAuthCookie = cookies.some((c: any) => c.name === "Authorization" && c.value && c.value.length > 20);
    const hasUprodCookie = cookies.some((c: any) => c.name === "u-prod" && c.value && c.value.length > 20);

    // Scan page for the comment editor
    const editor = await locateAndPrepareCommentEditor(page);

    if (!hasAuthCookie && !hasUprodCookie && !editor) {
      addLog("error", "Login validation failed: Missing core 'Authorization' or 'u-prod' cookies in context, and comment editor is missing.");
      return { status: "expired", message: "Logged out (Missing auth cookies)" };
    }

    // We only fail if the comment editor is missing.
    // If the comment editor is fully visible and prepared, we are functionally logged in!
    // We treat isHeaderLoginVisible as a non-blocking indicator because of high false-positives
    // (such as mobile menus, footers, promo links, or slow-loading profile headers).
    if (!editor) {
      await saveDebugScreenshot(page, "editor_failed");
      
      // Let's check for specific Cloudflare captcha elements first
      const title = await page.title().catch(() => "");
      const hasCfTitle = title.includes("Cloudflare") || title.includes("Just a moment");
      const hasCfSelectors = await page.$('#challenge-running, #challenge-stage, .cf-turnstile').catch(() => null);
      
      if (hasCfTitle || hasCfSelectors) {
        addLog("error", "CRITICAL: Cloudflare Turnstile human challenge detected on page!");
        return { status: "captcha", message: "Cloudflare Turnstile captcha block" };
      }

      if (isHeaderLoginVisible) {
        addLog("error", "Login validation failed: Comment editor is missing and active 'Log In' button is visible in the page header.");
        return { status: "expired", message: "Logged out (Log In button is visible)" };
      }

      // Check if button text indicates "Log In" is required
      const loginBtn = await page.$('button:has-text("Log In"), button:has-text("Sign Up")');
      if (loginBtn) {
        addLog("error", "Login validation failed: Session expired or invalid cookies. Detected Log In button.");
        return { status: "expired", message: "Logged out (Log In button found)" };
      }

      addLog("error", "Login validation failed: Could not locate the comment editor input box.");
      return { status: "expired", message: "Comment editor input missing or session inactive" };
    }
    
    // Now check the actual text on the post submit button if available to be 100% sure we are not prompted to login
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button'
    ];
    let postBtn = null;
    for (const selector of postButtonSelectors) {
      postBtn = await page.$(selector);
      if (postBtn) break;
    }
    if (postBtn) {
      const buttonText = await postBtn.innerText().catch(() => "");
      if (buttonText.toLowerCase().includes("log in") || buttonText.toLowerCase().includes("signin")) {
        addLog("error", "Login validation failed: Found comment editor, but submit button text is 'Log In' instead of 'Post'.");
        await saveDebugScreenshot(page, "login_required_post_btn");
        return { status: "expired", message: "Logged out (Post button requires Log In)" };
      }
    }

    addLog("success", "Successfully found and verified comment editor and active session state!");
    addLog("success", "Session active! Authentication is fully verified.");

    // Save refreshed storageState back to maintain session longevity
    try {
      await context.storageState({ path: st.AUTH_STATE_FILE });
      if (fs.existsSync(st.AUTH_STATE_FILE)) {
        const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloudIfChanged(cookiesStr, activeId || undefined);
        await autoSyncSessionToProfiles(cookiesStr);
      }
    } catch (e) {
      console.error("Failed to update and sync storage state after successful session check:", (e as Error).message);
    }

    return { status: "success", message: "Session active" };
  } catch (error) {
    addLog("error", `Playwright login check execution failed: ${(error as Error).message}`);
    return { status: "failed", message: (error as Error).message };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function checkLoginReal(): Promise<{ status: "success" | "expired" | "captcha" | "failed"; message: string }> {
  return PlaywrightLock.acquire(async () => {
    const attempts = 2;
    let lastResult: { status: "success" | "expired" | "captcha" | "failed"; message: string } = { status: "failed", message: "Not started" };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (attempt > 1) {
          addLog("warning", `[SESSION CONNECT RETRY] Session check or connection failed. Retrying connect (Attempt ${attempt}/${attempts}) in 3s...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        lastResult = await withTimeout(
          checkLoginRealInternal(),
          120000,
          "Playwright launch or session check timed out after 120 seconds"
        );
        if (lastResult.status === "success" || lastResult.status === "expired" || lastResult.status === "captcha") {
          return lastResult;
        }
        addLog("warning", `[SESSION CONNECT] Attempt ${attempt}/${attempts} returned status: ${lastResult.status} (${lastResult.message})`);
      } catch (err) {
        const errMsg = (err as Error).message;
        addLog("error", `[SESSION CONNECT] Exception on attempt ${attempt}: ${errMsg}`);
        lastResult = { status: "failed", message: errMsg };
      }
    }
    return lastResult;
  });
}

export async function executeStartLogin(email: string, password: string): Promise<{ status: "success" | "requires_otp" | "captcha" | "failed"; message: string }> {
  st.loginState = { status: "authenticating", message: "Starting automated credentials login flow..." };
  return PlaywrightLock.acquire(async () => {
    if (st.activeLoginSession) {
      addLog("warning", "An active login session exists in memory. Closing it before starting a new one...");
      await st.activeLoginSession.browser.close().catch(() => {});
      st.activeLoginSession = null;
    }

    addLog("info", `Starting automated credentials login flow for email: ${email}...`);
    st.loginState = { status: "authenticating", message: `Initializing secure headless browser for email: ${email}...` };
    let browser: any = null;
    try {
      browser = await launchBrowserResilient({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ]
      });

      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      const page = await context.newPage();
      await setupPageResourceBlocking(page);

      let loginFormLoadedDirectly = false;
      addLog("info", "Attempting direct navigation to CoinMarketCap Login page...");
      st.loginState = { status: "authenticating", message: "Attempting direct navigation to CoinMarketCap Login page..." };
      try {
        await page.goto("https://coinmarketcap.com/login/", {
          waitUntil: "domcontentloaded",
          timeout: 30000
        });
        await page.waitForTimeout(3000);
        
        // Fast pre-verification: check if login fields are present
        const hasEmail = await page.$('input[type="email"], input[placeholder*="email" i], input[name="email"], #email');
        const hasPass = await page.$('input[type="password"], input[placeholder*="password" i], input[name="password"], #password');
        if (hasEmail && hasPass) {
          addLog("success", "Successfully loaded CoinMarketCap Login page directly!");
          loginFormLoadedDirectly = true;
        } else {
          addLog("warning", "Direct login page did not present login input boxes. Redirecting to home page workflow...");
        }
      } catch (directErr) {
        addLog("warning", `Direct login page navigation timed out or failed: ${(directErr as Error).message}. Using Home page workflow...`);
      }

      if (!loginFormLoadedDirectly) {
        addLog("info", "Navigating to CoinMarketCap Home page...");
        st.loginState = { status: "authenticating", message: "Navigating to CoinMarketCap Home page workflow..." };
        await page.goto("https://coinmarketcap.com/", {
          waitUntil: "domcontentloaded",
          timeout: 45000
        }).catch((err) => {
          addLog("warning", `Failed to load home page: ${err.message}. Retrying with Bitcoin page...`);
          return page.goto("https://coinmarketcap.com/currencies/bitcoin/", {
            waitUntil: "domcontentloaded",
            timeout: 45000
          });
        });

        await page.waitForTimeout(4000);

        // Dismiss any cookie banners, trading disclaimers, or overlays that might block clicking the Log in button
        addLog("info", "Checking for cookie banners or overlay pop-ups to dismiss...");
        const dismissButtons = [
          'button:has-text("Start Trading")',
          'button:has-text("Skip")',
          'button:has-text("Continue")',
          'button:has-text("Next")',
          'button:has-text("Accept All")',
          'button:has-text("Accept Cookies")',
          'button:has-text("Accept")',
          'button:has-text("Allow All")',
          'button:has-text("Got it")',
          'button:has-text("I agree")',
          '#onetrust-accept-btn-handler',
          '.optanon-allow-all',
          '#accept-cookie-policy',
          '.cmc-cookie-policy-banner__close',
          'button[aria-label="Close"]',
          '.close-btn',
          '.close'
        ];
        for (const selector of dismissButtons) {
          try {
            const btn = await page.$(selector);
            if (btn && await btn.isVisible()) {
              await btn.click({ timeout: 2000 }).catch(() => {});
              addLog("info", `Dismissed banner/pop-up using: ${selector}`);
              await page.waitForTimeout(500);
            }
          } catch {}
        }

        addLog("info", "Searching for the 'Log In' button/link on the page header...");
        let headerLoginBtn = null;
        const loginButtonSelectors = [
          'button:has-text("Log In")',
          'button:has-text("Log in")',
          'a:has-text("Log In")',
          'a:has-text("Log in")',
          'span:has-text("Log In")',
          'span:has-text("Log in")',
          '[data-testid="header-login-button"]',
          '[class*="login" i]',
          '[class*="log-in" i]',
          'div:has-text("Log In")',
          'div:has-text("Log in")'
        ];
        for (const sel of loginButtonSelectors) {
          try {
            const el = await page.$(sel);
            if (el && await el.isVisible()) {
              headerLoginBtn = el;
              addLog("info", `Found Log in trigger element using selector: "${sel}"`);
              break;
            }
          } catch {}
        }

        if (!headerLoginBtn) {
          // Robust heuristic fallback for finding the header/navigation login button
          const clickables = await page.$$("button, a, div[role='button'], span");
          for (const item of clickables) {
            try {
              if (await item.isVisible()) {
                const text = (await item.innerText().catch(() => "")).trim().toLowerCase();
                if (text === "log in" || text === "login" || text === "sign in" || text === "signin") {
                  headerLoginBtn = item;
                  addLog("info", `Found Log in trigger via innerText heuristic match: "${text}"`);
                  break;
                }
              }
            } catch {}
          }
        }

        if (headerLoginBtn) {
          addLog("info", "Clicking the 'Log In' button/link to launch login popup...");
          await clickResiliently(page, headerLoginBtn, "header login button");
          addLog("info", "Waiting for login modal popup to open...");
          await page.waitForTimeout(4000);
        } else {
          addLog("warning", "Could not locate a visible Log In button. Proceeding directly in case the modal/form is already present.");
        }
      }

      // Ensure the "Log In" tab is active inside the modal (CoinMarketCap sometimes defaults to "Sign Up" or "Create an account")
      try {
        const modalContainer = await page.$('div[role="dialog"], [class*="modal" i]');
        if (modalContainer) {
          const loginTab = await modalContainer.$('[data-test="user-modal__login-tab"], div[data-test="user-modal__login-tab"], button:has-text("Log In"), [role="tab"]:has-text("Log In"), span:has-text("Log In"), div:has-text("Log In")');
          if (loginTab && await loginTab.isVisible()) {
            await loginTab.click().catch(() => {});
            await page.waitForTimeout(600);
          }
        }
      } catch {}

      // Scan for email and password inputs specifically targeting visible inputs
      let emailInput = null;
      let passwordInput = null;

      // Retry finding elements up to 5 times with delay
      for (let i = 0; i < 5; i++) {
        const emailSelectors = [
          '[data-test="email-input"]',
          'input.email-input',
          '.email-input',
          'div[role="dialog"] input[type="email"]',
          'div[role="dialog"] input[placeholder*="email" i]',
          'input[type="email"]',
          'input[placeholder*="email" i]',
          'input[placeholder*="Email" i]',
          'input[name="email"]',
          '#email',
          '#username'
        ];
        for (const sel of emailSelectors) {
          try {
            const els = await page.$$(sel);
            for (const el of els) {
              if (await el.isVisible()) {
                emailInput = el;
                break;
              }
            }
            if (emailInput) break;
          } catch {}
        }

        const passwordSelectors = [
          '[data-test="password-input"]',
          'input.password-input',
          '.password-input',
          'div[role="dialog"] input[type="password"]',
          'div[role="dialog"] input[placeholder*="password" i]',
          'input[type="password"]',
          'input[placeholder*="password" i]',
          'input[placeholder*="Password" i]',
          'input[name="password"]',
          '#password'
        ];
        for (const sel of passwordSelectors) {
          try {
            const els = await page.$$(sel);
            for (const el of els) {
              if (await el.isVisible()) {
                passwordInput = el;
                break;
              }
            }
            if (passwordInput) break;
          } catch {}
        }

        if (emailInput && passwordInput) {
          break;
        }
        
        addLog("info", `Waiting for email/password input boxes to load (Attempt ${i + 1}/5)...`);
        st.loginState = { status: "authenticating", message: `Waiting for email/password input boxes to load (Attempt ${i + 1}/5)...` };
        await page.waitForTimeout(2000);
      }

      // Subframe fallback scanning
      if (!emailInput || !passwordInput) {
        addLog("info", "Inputs not found on main frame. Scanning subframes...");
        st.loginState = { status: "authenticating", message: "Inputs not found on main frame. Scanning subframes..." };
        for (const frame of page.frames()) {
          try {
            const elEmail = await frame.$('[data-test="email-input"], input.email-input, .email-input, input[type="email"], input[placeholder*="email" i]');
            const elPass = await frame.$('[data-test="password-input"], input.password-input, .password-input, input[type="password"], input[placeholder*="password" i]');
            if (elEmail && elPass && await elEmail.isVisible() && await elPass.isVisible()) {
              emailInput = elEmail;
              passwordInput = elPass;
              addLog("info", "Located login inputs inside a subframe!");
              break;
            }
          } catch {}
        }
      }

      if (!emailInput || !passwordInput) {
        addLog("error", "Failed to locate login credentials input boxes.");
        await browser.close().catch(() => {});
        return { status: "failed", message: "Login form inputs (email/password) not found on page." };
      }

      addLog("info", "Entering email and password securely...");
      st.loginState = { status: "authenticating", message: "Entering email and password securely..." };
      await fillInputResiliently(page, emailInput, email);
      await page.waitForTimeout(400);
      await fillInputResiliently(page, passwordInput, password);
      await page.waitForTimeout(400);

      // Locate the submit button strictly inside the login dialog/modal or enclosing form
      let loginBtn = null;
      try {
        const modalContainer = await page.$('div[role="dialog"], [class*="modal" i], form:has(input[type="password"])');
        if (modalContainer) {
          // Priority 1: Explicit type="submit" or specific login data-test attributes (NEVER tab headers)
          const explicitSubmit = await modalContainer.$('button[type="submit"], form button[type="submit"], [data-test="user-modal__login-btn"], [data-test="login-btn"], [data-test="login-button"]');
          if (explicitSubmit && await explicitSubmit.isVisible()) {
            loginBtn = explicitSubmit;
          } else {
            // Priority 2: Scan candidate buttons, strictly skipping Tab elements
            const candidateBtns = await modalContainer.$$('button, div[role="button"]');
            for (const btn of candidateBtns) {
              if (await btn.isVisible()) {
                const isTab = await btn.evaluate((el: HTMLElement) => {
                  const role = el.getAttribute('role');
                  const dt = el.getAttribute('data-test') || '';
                  const ariaSel = el.getAttribute('aria-selected');
                  const cl = el.className || '';
                  return role === 'tab' || dt.includes('tab') || ariaSel !== null || (typeof cl === 'string' && cl.includes('tab'));
                }).catch(() => false);
                if (isTab) continue; // Skip tab headers!

                const text = (await btn.innerText().catch(() => "")).trim().toLowerCase();
                if (text === "log in" || text === "login" || text === "sign in" || text === "signin") {
                  loginBtn = btn;
                  break;
                }
              }
            }
          }
        }
      } catch {}

      if (!loginBtn) {
        const btnSelectors = [
          'button[type="submit"]',
          'form button[type="submit"]',
          '[data-test="user-modal__login-btn"]',
          '[data-test="login-btn"]',
          '[data-test="login-button"]',
          '.cmc-login-btn',
        ];
        for (const sel of btnSelectors) {
          loginBtn = await page.$(sel);
          if (loginBtn && await loginBtn.isVisible()) break;
        }
      }

      // Check if button is disabled by React and force event dispatch if needed
      if (loginBtn) {
        try {
          const isBtnDisabled = await loginBtn.evaluate((b: HTMLElement) => b.hasAttribute('disabled') || b.classList.contains('BaseButton_disabled__t5Wcr'));
          if (isBtnDisabled) {
            addLog("info", "Re-triggering focus events to ensure form validation...");
            await emailInput.focus().catch(() => {});
            await page.keyboard.press("End").catch(() => {});
            await page.keyboard.press("Space").catch(() => {});
            await page.keyboard.press("Backspace").catch(() => {});
            await passwordInput.focus().catch(() => {});
            await page.keyboard.press("End").catch(() => {});
            await page.keyboard.press("Space").catch(() => {});
            await page.keyboard.press("Backspace").catch(() => {});
            await page.waitForTimeout(400);
          }
        } catch {}
      }

      // Listen for network API responses to capture exact backend error messages
      let apiErrorMsg = "";
      const apiResponseListener = async (response: any) => {
        try {
          const u = response.url();
          if (u.includes("login") || u.includes("auth") || u.includes("user")) {
            const status = response.status();
            const body = await response.json().catch(() => null);
            if (body) {
              if (body.status && body.status.error_message) {
                apiErrorMsg = body.status.error_message;
              } else if (body.message) {
                apiErrorMsg = body.message;
              } else if (body.error) {
                apiErrorMsg = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
              }
            }
            if (status >= 400) {
              addLog("warning", `CoinMarketCap Auth API returned HTTP ${status}: ${apiErrorMsg || response.statusText()}`);
            }
          }
        } catch {}
      };
      page.on("response", apiResponseListener);

      addLog("info", "Submitting login form...");
      st.loginState = { status: "authenticating", message: "Submitting login form..." };

      // Submit form via both click and Enter key for maximum resilience
      try {
        if (loginBtn) {
          await loginBtn.click({ timeout: 5000 });
        } else {
          addLog("info", "Submit button not found directly, submitting via Enter key on password input...");
          await passwordInput.focus().catch(() => {});
          await passwordInput.press("Enter").catch(() => {});
        }
      } catch (clickErr) {
        addLog("warning", `Standard click failed, attempting Enter key submission: ${(clickErr as Error).message}`);
        await passwordInput.focus().catch(() => {});
        await passwordInput.press("Enter").catch(() => {});
      }
    
      addLog("info", "Processing credentials with CoinMarketCap...");
      st.loginState = { status: "authenticating", message: "Processing credentials with CoinMarketCap..." };

      let isSuccessEarly = false;
      let isOtpEarly = false;

      // Poll up to 25 seconds (50 x 500ms) for authentication verification, errors, or OTP challenge
      let detectedError = "";
      for (let p = 0; p < 50; p++) {
        await page.waitForTimeout(500);

        // 1. Immediate check for Cloudflare Turnstile / Captcha
        const hasCaptcha = await page.evaluate(() => {
          return document.querySelector('#challenge-running, #challenge-stage, .cf-turnstile, iframe[src*="challenges.cloudflare"]') !== null;
        }).catch(() => false);
        if (hasCaptcha) {
          addLog("error", "Cloudflare Turnstile challenge detected during credentials submission.");
          st.activeLoginSession = { browser, context, page, email };
          st.loginState = { status: "captcha", message: "Cloudflare Turnstile verification challenge detected." };
          return { status: "captcha", message: "Cloudflare Turnstile challenge detected." };
        }

        // 2. Immediate check for visible error messages on every poll iteration (instant failure feedback)
        try {
          const visibleErr = await page.evaluate(() => {
            const errorSelectors = [
              '.error-message',
              '.errorMessage',
              '[class*="error-message" i]',
              '[class*="errorMessage" i]',
              '[class*="form-error" i]',
              '[class*="FormError" i]',
              '[role="alert"]',
              '.error',
            ];
            for (const sel of errorSelectors) {
              const els = document.querySelectorAll(sel);
              for (let i = 0; i < els.length; i++) {
                const el = els[i] as HTMLElement;
                if (!el || el.offsetParent === null) continue;
                const text = (el.innerText || "").trim();
                const lower = text.toLowerCase();
                if (
                  text.length > 3 &&
                  !lower.includes("sign up") &&
                  !lower.includes("terms") &&
                  !lower.includes("cookie") &&
                  (lower.includes("wrong") || lower.includes("incorrect") || lower.includes("invalid") || lower.includes("failed") || lower.includes("not match") || lower.includes("does not exist") || lower.includes("too many attempts") || lower.includes("locked"))
                ) {
                  return text;
                }
              }
            }
            return null;
          }).catch(() => null);

          if (visibleErr) {
            detectedError = visibleErr;
            addLog("error", `CoinMarketCap rejected credentials: "${visibleErr}"`);
            break;
          }
        } catch (_) {}

        // 3. Check for 6-digit verification code / OTP challenge
        const hasOtpField = await page.evaluate(() => {
          const inp = document.querySelector('input[placeholder*="code" i], input[placeholder*="verification" i], input[maxlength="6"], [data-test*="otp" i], [data-test*="verification" i]');
          const bodyText = (document.body.innerText || "").toLowerCase();
          return !!inp || bodyText.includes("verification code") || bodyText.includes("6-digit") || bodyText.includes("check your email");
        }).catch(() => false);

        if (hasOtpField) {
          isOtpEarly = true;
          break;
        }

        // 4. Strict authentication check: requires avatar OR verified user session
        const currentCookies = await context.cookies().catch(() => []);
        const hasAuthCookies = hasRealAuthCookies(currentCookies);

        const hasAvatar = await page.evaluate(() => {
          return document.querySelector('[data-test="header-avatar"], .user-avatar, img[alt*="avatar" i], [class*="avatar" i], a[href*="/account/"], [class*="user-icon" i]') !== null;
        }).catch(() => false);

        // Only declare early success if genuine user avatar is present, or verified JWT auth cookie with settled state (p >= 4)
        if (hasAvatar || (hasAuthCookies && p >= 4)) {
          isSuccessEarly = true;
          break;
        }

        if (p % 10 === 0 && p > 0) {
          st.loginState = { status: "authenticating", message: `Processing authentication with CoinMarketCap (${Math.round((p / 50) * 100)}%)...` };
        }
      }

      if (detectedError) {
        await browser.close().catch(() => {});
        st.loginState = { status: "failed", message: `Login failed: ${detectedError}` };
        st.botStatus = "Idle";
        return { status: "failed", message: `Login failed: ${detectedError}` };
      }

      if (isSuccessEarly) {
        addLog("success", "Authentication verified directly after credentials submission!");
        await context.storageState({ path: st.AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${st.AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        st.loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        st.botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      if (isOtpEarly) {
        addLog("warning", "CoinMarketCap requests 6-digit security verification code!");
        st.activeLoginSession = { browser, context, page, email };
        st.loginState = { status: "requires_otp", message: "A 6-digit verification code has been sent to your email. Please enter it to authorize." };
        return { status: "requires_otp", message: "A 6-digit code has been sent to your email. Please enter it to authorize." };
      }

      // Check if visible error is present inside modal with strict validation
      let modalErrorMessage = detectedError;
      if (!modalErrorMessage) {
        try {
          const errorSelectors = [
            '.error-message',
            '.errorMessage',
            '[class*="error-message" i]',
            '[class*="errorMessage" i]',
            '[class*="form-error" i]',
            '[class*="FormError" i]',
            '[role="alert"]',
          ];
          for (const sel of errorSelectors) {
            const errorEls = await page.$$(sel);
            for (const errorEl of errorEls) {
              const isVisible = await errorEl.isVisible().catch(() => false);
              if (!isVisible) continue;

              const text = (await errorEl.innerText().catch(() => "")).trim();
              const lower = text.toLowerCase();
              if (
                text &&
                !lower.includes("sign up") &&
                !lower.includes("terms") &&
                !lower.includes("cookie") &&
                (lower.includes("wrong") || lower.includes("incorrect") || lower.includes("invalid") || lower.includes("failed") || lower.includes("not match") || lower.includes("error") || lower.includes("does not exist") || lower.includes("disabled") || lower.includes("locked"))
              ) {
                modalErrorMessage = text;
                addLog("warning", `Detected verified error message: "${text}"`);
                break;
              }
            }
            if (modalErrorMessage) break;
          }
        } catch {}
      }

      if (modalErrorMessage) {
        await browser.close().catch(() => {});
        st.loginState = { status: "failed", message: `Login failed: ${modalErrorMessage}` };
        st.botStatus = "Idle";
        return { status: "failed", message: `Login failed: ${modalErrorMessage}` };
      }

      // Secondary verification on bitcoin community page
      addLog("info", "Performing secondary verification on community page...");
      st.loginState = { status: "authenticating", message: "Verifying live session cookies on CoinMarketCap community..." };
      try {
        await page.goto("https://coinmarketcap.com/currencies/bitcoin/", { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (_) {}
      await page.waitForTimeout(2000);

      const secondaryCookies = await context.cookies().catch(() => []);
      const hasSecondaryAuth = hasRealAuthCookies(secondaryCookies);

      const secondaryAvatar = await page.evaluate(() => {
        return document.querySelector('[data-test="header-avatar"], .user-avatar, img[alt*="avatar" i], [class*="avatar" i], a[href*="/account/"], [class*="user-icon" i]') !== null;
      }).catch(() => false);

      const secondaryEditor = await locateAndPrepareCommentEditor(page).catch(() => null);
      const editorRequiresLogin = await isEditorPostButtonRequiringLogin(page);

      if (!editorRequiresLogin && (secondaryAvatar || (hasSecondaryAuth && secondaryEditor))) {
        addLog("success", "Successfully authenticated and verified community access!");
        await context.storageState({ path: st.AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${st.AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        st.loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        st.botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      await saveDebugScreenshot(page, "credentials_login_failed");
      await browser.close().catch(() => {});
      
      const finalMsg = modalErrorMessage 
        ? `Login failed: ${modalErrorMessage}` 
        : (editorRequiresLogin ? "Login incomplete: CoinMarketCap still prompts to Log In on the community page. Please verify your credentials or check for an email verification code." : "Credentials submitted, but CoinMarketCap did not establish an active session. Please check your email and password, or paste your state.json cookies directly.");
      st.loginState = { status: "failed", message: finalMsg };
      st.botStatus = "Idle";
      return { status: "failed", message: finalMsg };

  } catch (error) {
    const errMsg = (error as Error).message;
    addLog("error", `Exception in interactive login flow: ${errMsg}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    st.loginState = { status: "failed", message: errMsg };
    return { status: "failed", message: errMsg };
  }
  });
}

export async function executeSubmitOtp(otp: string): Promise<{ status: "success" | "failed"; message: string }> {
  st.loginState = { status: "authenticating", message: "Submitting verification code..." };
  return PlaywrightLock.acquire(async () => {
  if (!st.activeLoginSession) {
    addLog("error", "No active login session in memory to submit verification code.");
    st.loginState = { status: "failed", message: "No active login session in progress." };
    return { status: "failed", message: "No active login session in progress." };
  }

  const { browser, context, page, email } = st.activeLoginSession;
  if (browser && !browser.isConnected()) {
    addLog("error", "Active login session browser has been disconnected or closed. Please restart the login process.");
    st.activeLoginSession = null;
    st.loginState = { status: "failed", message: "Login session expired or browser disconnected. Please start login again." };
    return { status: "failed", message: "Login session expired or browser disconnected. Please start login again." };
  }

  addLog("info", `Submitting 6-digit verification code: ${otp} for email: ${email}...`);
  st.loginState = { status: "authenticating", message: `Submitting 6-digit verification code: ${otp}...` };

  try {
    const cleanOtp = otp.trim();
    let codeInput = null;

    // Check if CoinMarketCap renders segmented single-digit boxes (e.g. 6 separate inputs)
    const segmentedBoxes = await page.$$('input[maxlength="1"], input[data-index], input[name*="code" i], input[type="tel"]');
    const visibleBoxes: any[] = [];
    for (const box of segmentedBoxes) {
      if (await box.isVisible()) {
        visibleBoxes.push(box);
      }
    }

    if (visibleBoxes.length >= 4) {
      addLog("info", `Detected ${visibleBoxes.length} segmented OTP digit boxes. Filling each digit individually...`);
      for (let i = 0; i < Math.min(visibleBoxes.length, cleanOtp.length); i++) {
        await visibleBoxes[i].click().catch(() => {});
        await visibleBoxes[i].focus().catch(() => {});
        await visibleBoxes[i].fill(cleanOtp[i]).catch(() => {});
        await page.waitForTimeout(60);
      }
      codeInput = visibleBoxes[0];
    } else {
      const codeSelectors = [
        'input[placeholder*="code" i]',
        'input[placeholder*="verification" i]',
        'input[placeholder*="OTP" i]',
        'input[maxlength="6"]',
        'input[type="text"]',
        'input[type="number"]',
      ];

      for (const sel of codeSelectors) {
        const inputs = await page.$$(sel);
        for (const input of inputs) {
          if (await input.isVisible()) {
            codeInput = input;
            break;
          }
        }
        if (codeInput) break;
      }

      if (!codeInput) {
        codeInput = await page.$('input:not([type="hidden"])');
      }

      if (!codeInput) {
        addLog("error", "Failed to locate security code input field.");
        await browser.close().catch(() => {});
        st.activeLoginSession = null;
        return { status: "failed", message: "Could not find the security code input box." };
      }

      await fillInputResiliently(page, codeInput, cleanOtp);
      await page.waitForTimeout(500);
    }

    let submitBtn = null;
    const submitBtnSelectors = [
      'button[type="submit"]',
      'button:has-text("Confirm")',
      'button:has-text("Submit")',
      'button:has-text("Verify")',
      'button:has-text("Log In")',
      'form button',
    ];
    for (const sel of submitBtnSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        if (await btn.isVisible()) {
          submitBtn = btn;
          break;
        }
      }
      if (submitBtn) break;
    }

    if (submitBtn) {
      addLog("info", "Clicking security code submit button...");
      try {
        await submitBtn.click({ timeout: 5000 });
      } catch (clickErr) {
        addLog("warning", `Standard click on security submit button failed: ${(clickErr as Error).message}. Trying forced click...`);
        try {
          await submitBtn.click({ force: true, timeout: 5000 });
        } catch (forceErr) {
          addLog("warning", `Forced click failed: ${(forceErr as Error).message}. Trying evaluate click fallback...`);
          await submitBtn.evaluate((el: any) => (el as HTMLElement).click()).catch(() => {});
        }
      }
    } else {
      addLog("info", "No confirm button found, pressing Enter...");
      await codeInput.press("Enter");
    }

    addLog("info", "Waiting for authentication submission to complete (up to 10 seconds)...");
    st.loginState = { status: "authenticating", message: "Waiting for verification code submission response..." };
    await page.waitForTimeout(10000);

    // Verify successful session
    addLog("info", "Navigating to CoinMarketCap to verify session active state...");
    st.loginState = { status: "authenticating", message: "Navigating to verify session active state..." };
    await page.goto("https://coinmarketcap.com/currencies/bitcoin/", { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Use our robust locateAndPrepareCommentEditor to check if we can access the editor
    const editor = await locateAndPrepareCommentEditor(page);
    
    // Also check if any header Log In buttons are visible on the page
    let isHeaderLoginVisible = false;
    const headerLoginSelectors = [
      'button:has-text("Log In")',
      'button:has-text("Log in")',
      'a:has-text("Log In")',
      'a:has-text("Log in")',
      '[data-testid="header-login-button"]'
    ];
    for (const sel of headerLoginSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          isHeaderLoginVisible = true;
          break;
        }
      } catch {}
    }

    const editorRequiresLogin = await isEditorPostButtonRequiringLogin(page);
    const cookiesList = await context.cookies().catch(() => []);
    const hasAuthCookie = hasRealAuthCookies(cookiesList);

    if (!editorRequiresLogin && (hasAuthCookie || (editor && !isHeaderLoginVisible))) {
      addLog("success", "OTP verification successful! Session is fully active!");
      await context.storageState({ path: st.AUTH_STATE_FILE });
      addLog("success", `Saved authorized session cookies to ${st.AUTH_STATE_FILE}`);
      
      // Sync successfully saved session to Cloud and Auto-Update Profiles
      try {
        const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloud(cookiesStr, activeId || undefined);
        autoSyncSessionToProfiles(cookiesStr, email);
      } catch (e) {
        console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
      }

      await browser.close().catch(() => {});
      st.activeLoginSession = null;
      st.loginState = { status: "success", message: "Successfully verified and logged in! State loaded." };
      return { status: "success", message: "Successfully verified and logged in! State loaded." };
    } else {
      let otpErrorMsg = "";
      try {
        const errEl = await page.$('.error-message, [class*="error-message" i], [class*="errorMessage" i], [role="alert"]');
        if (errEl && await errEl.isVisible()) {
          otpErrorMsg = (await errEl.innerText().catch(() => "")).trim();
        }
      } catch {}
      const failMessage = otpErrorMsg ? `Verification failed: ${otpErrorMsg}` : "Verification code failed or expired. Please try logging in again.";
      addLog("error", `Code submission completed, but verification failed: ${failMessage}`);
      await saveDebugScreenshot(page, "otp_verification_failed");
      await browser.close().catch(() => {});
      st.activeLoginSession = null;
      st.loginState = { status: "failed", message: failMessage };
      return { status: "failed", message: failMessage };
    }

  } catch (error) {
    addLog("error", `Exception during OTP submission: ${(error as Error).message}`);
    await browser.close().catch(() => {});
    st.activeLoginSession = null;
    return { status: "failed", message: (error as Error).message };
  }
  });
}

export async function executeCancelLogin(): Promise<void> {
  if (st.activeLoginSession) {
    addLog("warning", "Manually cancelling and closing active login session...");
    await st.activeLoginSession.browser.close().catch(() => {});
    st.activeLoginSession = null;
  }
}
