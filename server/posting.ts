import { fs } from "./config.ts";
import { st } from "./state.ts";
import { addLog } from "./logger.ts";
import { saveSessionStateCloudIfChanged } from "./files.ts";
import { getActiveProfileId, autoSyncSessionToProfiles } from "./profiles.ts";
import { getLocalBotSettings, getNextSingleMarketingImage } from "./settings.ts";
import { PlaywrightLock, launchBrowserResilient, saveDebugScreenshot, clickResiliently, typeWithHumanRhythm, locateAndPrepareCommentEditor, setupPageResourceBlocking, extractFingerprintDetails } from "./browser.ts";
import { sanitizeCommentForAntiSpam } from "../src/utils/formatters.ts";

export async function runRealPostingInternal(url: string, message: string, sentiment: string, sharedBrowser?: any): Promise<{ status: "success" | "expired" | "captcha" | "failed" | "retry"; message: string; postUrl?: string }> {
  let browser: any = sharedBrowser || null;
  let ownsBrowser = !sharedBrowser;
  
  if (browser && !browser.isConnected()) {
    addLog("warning", "Provided shared browser instance is disconnected. Discarding it and launching fresh on-demand instance...");
    browser = null;
    ownsBrowser = true;
  }

  let context: any = null;
  let page: any = null;
  
  try {
    if (!browser) {
      addLog("info", "Playwright launching headlessly with stealth configurations...");
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
      st.activePostingBrowser = browser;
    } else {
      addLog("info", "Re-using existing active Playwright browser instance for posting task.");
    }

    // Extract fingerprint details from user's state.json to maximize session authenticity
    const { userAgent, timezoneId, locale } = extractFingerprintDetails(st.AUTH_STATE_FILE);

    addLog("info", `Loading browser context storage state from auth/state.json with fingerprint settings (User-Agent: ${userAgent.substring(0, 40)}..., Timezone: ${timezoneId}, Locale: ${locale})...`);
    context = await browser.newContext({
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

    page = await context.newPage();
    st.activePostingPage = page;
    
    // Set explicit navigation and operation timeouts to 90 seconds (Guideline 9)
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    if (st.isStopping || st.isSingleStopping || !st.isPostingRunning || st.stopSchedulerRequested) {
      return { status: "failed", message: "Posting sequence stopped by user." };
    }

    await setupPageResourceBlocking(page);
    addLog("info", `Navigating to target coin URL: ${url}`);
    
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
    } catch (gotoErr) {
      addLog("warning", `Target coin page navigation timeout/warning (continuing anyway to check elements): ${(gotoErr as Error).message}`);
    }
    
    // Wait for the page to settle
    await page.waitForTimeout(2000);

    // Fast Cloudflare challenge check right after page settles
    const initialTitle = await page.title().catch(() => "");
    if (initialTitle.includes("Cloudflare") || initialTitle.includes("Just a moment") || initialTitle.includes("Attention Required")) {
      addLog("error", "CRITICAL: Cloudflare challenge detected upon loading coin page!");
      return { status: "captcha", message: "Cloudflare Turnstile challenge block" };
    }
    
    // Scan page for the comment editor
    const editor = await locateAndPrepareCommentEditor(page);

    if (!editor) {
      await saveDebugScreenshot(page, "posting_editor_not_found");
      
      const currentUrl = page.url();
      if (currentUrl.includes("/login") || currentUrl.includes("/signin") || currentUrl.includes("/auth")) {
        addLog("error", `Session-verify check failed: Redirected to login page (${currentUrl})`);
        return { status: "expired", message: "Session expired: Redirected to login page" };
      }

      const title = await page.title().catch(() => "");
      const hasCfTitle = title.includes("Cloudflare") || title.includes("Just a moment");
      const hasCfSelectors = await page.$('#challenge-running, #challenge-stage, .cf-turnstile').catch(() => null);
      
      if (hasCfTitle || hasCfSelectors) {
        addLog("error", "CRITICAL: Cloudflare Turnstile human challenge detected on posting page!");
        return { status: "captcha", message: "Cloudflare Turnstile captcha block" };
      }

      const loginBtn = await page.$('button:has-text("Log In"), button:has-text("Sign Up")');
      if (loginBtn && await loginBtn.isVisible()) {
        addLog("error", "Session expired or logged out. Found active 'Log In' or 'Sign Up' buttons.");
        return { status: "expired", message: "Not logged in - Session expired" };
      }

      addLog("error", "Could not locate the post comment editor input box on the page.");
      return { status: "failed", message: "Comment editor element not found on coin page" };
    }

    addLog("success", "Session check passed! Comment editor located successfully on posting page.");
    
    const finalComment = message;
    // Item 13: Check if this specific comment was already published in recent feed
    try {
      const isAlreadyPosted = await page.evaluate((textSnippet: string) => {
        const feed = document.querySelector('.community-feed, [class*="feed" i], [class*="comment" i], [class*="post-list" i], main');
        const targetText = feed ? (feed as HTMLElement).innerText : document.body.innerText;
        return targetText.includes(textSnippet);
      }, finalComment.slice(0, 35));

      if (isAlreadyPosted) {
        addLog("warning", `Detected comment text snippet already published on this coin's community feed. Skipping duplicate submission.`);
        return { status: "success", message: "Comment already published on community feed" };
      }
    } catch (_) {}

    if (st.isStopping || st.isSingleStopping || !st.isPostingRunning || st.stopSchedulerRequested) {
      return { status: "failed", message: "Posting sequence stopped by user." };
    }

    // 1. Focus editor and clear previous text/drafts
    addLog("info", "Focusing editor and clearing previous text...");
    await clickResiliently(page, editor, "comment editor input box");
    await page.waitForTimeout(300);
    try {
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A").catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await editor.evaluate((el: any) => {
        const elem = el as HTMLElement;
        if (elem.tagName === "TEXTAREA" || elem.tagName === "INPUT") {
          (elem as any).value = "";
        } else {
          elem.innerText = "";
          elem.innerHTML = "";
        }
        elem.dispatchEvent(new Event('input', { bubbles: true }));
      }).catch(() => {});
    } catch {}
    await page.waitForTimeout(300);

    // 2. Focus editor and position cursor strictly after the pre-filled CMC tag chip
    await editor.focus().catch(() => {});
    await page.keyboard.press("End").catch(() => {});
    await page.keyboard.press("ArrowRight").catch(() => {});
    await page.waitForTimeout(100);

    // Inspect what is in the editor now (CoinMarketCap Draft.js retains its coin tag chip e.g. "$DGAI")
    let existingTag = "";
    let currentEditorText = "";
    try {
      currentEditorText = (await editor.innerText().catch(() => "")) || "";
      const tagMatch = currentEditorText.match(/\$[A-Za-z0-9_.-]+/);
      if (tagMatch) {
        existingTag = tagMatch[0].toUpperCase();
      }
    } catch (_) {}

    // Clean comment using sanitizeCommentForAntiSpam so there are NEVER duplicate tags, spam words, or formatting glitches
    let textToType = sanitizeCommentForAntiSpam(finalComment, existingTag).trim();

    // Guarantee physical separation after CMC's Draft.js tag chip so words NEVER glue together (e.g. prevents "$DGAISeeing")
    const hasPreExistingTag = Boolean(existingTag || currentEditorText.trim().length > 0);
    if (hasPreExistingTag) {
      await editor.focus().catch(() => {});
      await page.keyboard.press("End").catch(() => {});
      await page.keyboard.press("ArrowRight").catch(() => {});
      await page.keyboard.press("Space").catch(() => {});
      await page.waitForTimeout(150);
      // Prepend an explicit leading space to the typed text buffer to guarantee separation in Draft.js AST
      if (!textToType.startsWith(" ")) {
        textToType = " " + textToType;
      }
    }

    addLog("info", `Typing comment into editor using human typing cadence: "${textToType.trim()}" (anti-ban simulation active)`);
    try {
      // Humanized typing simulation with natural micro-jitter, punctuation pacing, and word breaks
      await typeWithHumanRhythm(page, textToType);
      
      // CoinMarketCap displays a coin tag autocomplete popup when "$" is typed.
      // Pressing Escape dismisses the autocomplete popup while retaining the tag.
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape").catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
      
      // Human cognitive delay: Pause to simulate reading/reviewing the comment before clicking submit
      const reviewPause = 800 + Math.floor(Math.random() * 800);
      await page.waitForTimeout(reviewPause);
    } catch (e) {
      addLog("warning", `Direct human typing failed: ${(e as Error).message}. Using page.evaluate fallback...`);
      try {
        await editor.evaluate((el: any, msg: string) => {
          const element = el as HTMLElement;
          element.focus();
          if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
            (element as any).value = msg;
          } else {
            element.innerText = msg;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, textToType);
      } catch (errEval) {
        addLog("error", `Fallback typing failed: ${(errEval as Error).message}`);
        throw errEval;
      }
    }
    await page.waitForTimeout(300);

    // ==========================================
    // Marketing Image Upload (Strictly 1 Image Per Comment)
    // ==========================================
    try {
      const botSettings = getLocalBotSettings();
      if (botSettings.imageUploadEnabled) {
        const nextImage = getNextSingleMarketingImage();
        if (nextImage && fs.existsSync(nextImage.filePath)) {
          addLog("info", `Marketing image enabled: Attaching 1 image (${nextImage.filename}) to comment...`);
          
          // Selectors based on CoinMarketCap comment editor toolbar DOM:
          // <span class="toolbar-item img" data-test="editor-img-button">
          //   <label for="img-icon-..."><svg>...</svg></label>
          //   <input type="file" class="input-file-node" id="img-icon-..." accept=".jpeg,.jpg,.png,.gif,..." multiple="">
          // </span>
          const fileInputSelectors = [
            '.editor-toolbar input.input-file-node',
            '[data-test="editor-img-button"] input[type="file"]',
            '.editor-toolbar .toolbar-item.img input[type="file"]',
            '.editor-toolbar input[type="file"]',
            'input.input-file-node[type="file"]',
            'input[type="file"][accept*="png"]',
            'input[type="file"]'
          ];
          
          let fileInputHandle = null;
          for (const sel of fileInputSelectors) {
            fileInputHandle = await page.$(sel);
            if (fileInputHandle) {
              addLog("info", `Located file input selector: ${sel}`);
              break;
            }
          }

          if (fileInputHandle) {
            // Strictly 1 image passed as a single file path string
            await fileInputHandle.setInputFiles(nextImage.filePath);
            addLog("success", `Successfully attached 1 marketing image: ${nextImage.filename}`);
            
            // Allow CMC editor to process and render the single image preview thumbnail
            await page.waitForTimeout(1500);
            
            // Verify or wait for thumbnail preview to appear
            await page.waitForSelector('.editor-image-preview, [class*="preview"], [class*="image-item"], .upload-image-preview', { timeout: 4000 }).catch(() => {});

            // Wait for any active image upload spinner/progress or disabled Post button to finish before submitting
            for (let imgWait = 0; imgWait < 12; imgWait++) {
              const isUploadingImg = await page.evaluate(() => {
                const spinners = document.querySelectorAll('.editor-image-preview [class*="loading" i], .editor-image-preview [class*="spinner" i], .upload-image-preview [class*="loading" i], [data-test="editor-post-button"][disabled], .editor-post-button[disabled], .editor-post-button.disabled');
                return spinners.length > 0;
              }).catch(() => false);
              if (!isUploadingImg) break;
              await page.waitForTimeout(500);
            }
          } else {
            addLog("warning", "File input element not found in comment editor toolbar. Posting text-only.");
          }
        } else {
          addLog("info", "Image upload is enabled, but no marketing image files are available in library.");
        }
      }
    } catch (imgErr) {
      addLog("warning", `Marketing image attachment encountered error: ${(imgErr as Error).message}. Continuing post resiliently...`);
    }

    // Find and toggle sentiment (Bullish or Bearish)
    const isBullish = sentiment !== "bearish";
    const sentimentSelectors = isBullish ? [
      '[data-test="editor-bullish-button"]',
      'button:has-text("Bullish")',
      'span:has-text("Bullish")',
      '.bullish-button',
      '[class*="bullish" i]',
      'button:has-text("Bull")',
      '[data-test*="bullish" i]',
      '[aria-label*="bullish" i]',
      'button:has-text("🚀")',
      'button:has-text("🐂")'
    ] : [
      '[data-test="editor-bearish-button"]',
      'button:has-text("Bearish")',
      'span:has-text("Bearish")',
      '.bearish-button',
      '[class*="bearish" i]',
      'button:has-text("Bear")',
      '[data-test*="bearish" i]',
      '[aria-label*="bearish" i]',
      'button:has-text("📉")',
      'button:has-text("🐻")'
    ];
    let sentimentBtn = null;
    for (const selector of sentimentSelectors) {
      sentimentBtn = await page.$(selector);
      if (sentimentBtn) {
        addLog("info", `Found ${isBullish ? "bullish" : "bearish"} sentiment toggle using: ${selector}`);
        break;
      }
    }
    if (sentimentBtn) {
      addLog("info", `Clicking ${isBullish ? "bullish" : "bearish"} sentiment toggle...`);
      await clickResiliently(page, sentimentBtn, `${isBullish ? "bullish" : "bearish"} sentiment toggle button`);
      await page.waitForTimeout(300);
    } else {
      addLog("warning", `Could not find ${isBullish ? "bullish" : "bearish"} sentiment toggle button.`);
    }
    
    // Find Post submit button with multi-tier selectors and heuristic fallback
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button',
      'button:has-text("Publish")',
      'button[type="submit"]',
      '[role="button"]:has-text("Post")',
      '[role="button"]:has-text("Submit")',
      'div:has-text("Post")[role="button"]',
      'span:has-text("Post")',
      'button[aria-label*="post" i]',
      'button[aria-label*="submit" i]',
      'button[data-testid*="post" i]',
      'button[data-testid*="submit" i]'
    ];
    let postBtn = null;
    for (const selector of postButtonSelectors) {
      postBtn = await page.$(selector);
      if (postBtn) {
        addLog("info", `Found submit button using: ${selector}`);
        break;
      }
    }

    // Heuristic DOM evaluation fallback for Post button (protection against obfuscated class names)
    if (!postBtn) {
      try {
        addLog("info", "Executing heuristic DOM scanner fallback for post button...");
        const fallbackBtnHandle = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"], div[style*="cursor: pointer"], span[role="button"]'));
          for (const btn of buttons) {
            const txt = ((btn as HTMLElement).innerText || "").trim().toLowerCase();
            const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
            if (txt === "post" || txt === "submit" || txt === "publish" || txt === "comment" || aria.includes("post") || aria.includes("submit")) {
              const rect = (btn as HTMLElement).getBoundingClientRect();
              const style = window.getComputedStyle(btn);
              if (rect.width > 20 && rect.height > 15 && style.visibility !== "hidden" && style.display !== "none") {
                return btn;
              }
            }
          }
          return null;
        });
        const el = fallbackBtnHandle?.asElement();
        if (el) {
          const isVisible = await el.isVisible().catch(() => false);
          if (isVisible) {
            addLog("success", "Located post button using heuristic DOM scanner fallback!");
            postBtn = el;
          }
        }
      } catch (_) {}
    }

    if (!postBtn) {
      addLog("error", "Post submission button is missing on page.");
      await saveDebugScreenshot(page, "post_button_missing");
      return { status: "failed", message: "Post submission button missing" };
    }
    
    const buttonText = await postBtn.innerText().catch(() => "");
    if (buttonText.toLowerCase().includes("log in") || buttonText.toLowerCase().includes("signin")) {
      addLog("error", "Post button indicates user is logged out.");
      await saveDebugScreenshot(page, "logged_out_post_btn");
      return { status: "expired", message: "Post button text is Log In" };
    }
    
    if (st.isStopping || st.isSingleStopping || !st.isPostingRunning || st.stopSchedulerRequested) {
      return { status: "failed", message: "Posting sequence stopped by user." };
    }

    // Natural human hover and pause before clicking Post button
    await postBtn.hover().catch(() => {});
    await page.waitForTimeout(300 + Math.floor(Math.random() * 400));

    // Check if the Post button is disabled before clicking (e.g., empty editor or pending image upload)
    const isBtnDisabledBeforeClick = await postBtn.evaluate((el: any) => {
      const elem = el as HTMLElement;
      return (
        (elem as HTMLButtonElement).disabled === true ||
        elem.getAttribute("disabled") !== null ||
        elem.getAttribute("aria-disabled") === "true" ||
        elem.classList.contains("disabled")
      );
    }).catch(() => false);

    if (isBtnDisabledBeforeClick) {
      addLog("info", "Post button is currently disabled (waiting for editor or image upload to settle)...");
      await page.waitForTimeout(2000);
    }

    const snippetToVerify = textToType.trim().slice(0, 28);
    let postApiObserved = false;
    let postApiSucceeded = false;
    let postApiErrorMsg = "";
    let createdPostUrl = "";

    const responseListener = async (response: any) => {
      try {
        const req = response.request();
        if (req.method() !== "POST") return;
        const rUrl = response.url().toLowerCase();
        // Exclude background read/feed/list/query/telemetry/impression POST requests that return 200 OK without creating a comment
        const isReadOrTelemetryEndpoint =
          rUrl.includes("trending") ||
          rUrl.includes("/list") ||
          rUrl.includes("query") ||
          rUrl.includes("search") ||
          rUrl.includes("impression") ||
          rUrl.includes("analytics") ||
          rUrl.includes("telemetry") ||
          rUrl.includes("recommend") ||
          rUrl.includes("announcement") ||
          rUrl.includes("vote") ||
          rUrl.includes("like") ||
          rUrl.includes("follow");

        if (
          !isReadOrTelemetryEndpoint &&
          (rUrl.includes("gravity") || rUrl.includes("comment") || rUrl.includes("post"))
        ) {
          const status = response.status();
          if (status >= 200 && status < 300) {
            const body = await response.json().catch(() => null);
            if (!body || typeof body !== "object") return;
            // Ignore feed list responses that return arrays of posts
            if (Array.isArray(body?.data) || Array.isArray(body?.data?.list) || Array.isArray(body?.data?.posts)) {
              return;
            }
            const errCode = body?.status?.error_code ?? body?.error_code ?? body?.code;
            const errMsg = body?.status?.error_message || body?.error_message || body?.message || "";
            if (errCode && String(errCode) !== "0" && String(errCode) !== "200") {
              postApiObserved = true;
              postApiErrorMsg = String(errMsg || `API error code ${errCode}`);
            } else {
              const rawPostId =
                body?.data?.gravityId ??
                body?.data?.postId ??
                body?.data?.commentId ??
                body?.data?.id ??
                body?.gravityId ??
                (typeof body?.data === "string" || typeof body?.data === "number" ? body.data : "");
              const isExplicitCreateUrl =
                /\/(post|comment|create|add|publish|submit)(\?|$|\/)/i.test(rUrl);
              if (rawPostId || isExplicitCreateUrl) {
                postApiObserved = true;
                postApiSucceeded = true;
                if (rawPostId && String(rawPostId).trim().length > 0) {
                  createdPostUrl = `https://coinmarketcap.com/community/post/${encodeURIComponent(String(rawPostId).trim())}/`;
                }
              }
            }
          } else if (status === 429) {
            postApiObserved = true;
            postApiErrorMsg = "HTTP 429 rate limit";
          } else if (status === 401 || status === 403) {
            postApiObserved = true;
            postApiErrorMsg = `HTTP ${status} unauthorized/restricted`;
          }
        }
      } catch (_) {}
    };

    page.on("response", responseListener);

    addLog("info", "Clicking post submission button...");
    await clickResiliently(page, postBtn, "post submission button");
    
    // Wait for submission to process
    await page.waitForTimeout(3500);

    // Check if the editor still contains our typed comment text (meaning the click did not submit yet)
    const checkEditorStillHasTypedText = async (): Promise<boolean> => {
      try {
        const currentText = ((await editor.innerText().catch(() => "")) || "").trim();
        if (!currentText) return false;
        // If only the pre-filled $SYMBOL tag remains (e.g. "$BTC"), the comment cleared!
        const withoutTag = existingTag ? currentText.replace(new RegExp(`\\${existingTag}`, "gi"), "").trim() : currentText;
        if (withoutTag.length === 0) return false;
        if (snippetToVerify.length >= 8 && currentText.includes(snippetToVerify)) {
          return true;
        }
        return withoutTag.length > Math.max(12, Math.floor(textToType.trim().length * 0.5));
      } catch (_) {
        return false;
      }
    };

    let editorStillUnposted = await checkEditorStillHasTypedText();
    if (editorStillUnposted && !postApiSucceeded && !postApiErrorMsg) {
      addLog("warning", "Editor still contains comment text after first Post click. Retrying Post button click...");
      await clickResiliently(page, postBtn, "post submission button (retry)");
      await page.waitForTimeout(3500);
      editorStillUnposted = await checkEditorStillHasTypedText();
    }

    page.off("response", responseListener);
    
    // Anti-Ban & Moderation Detection: Scan alerts, feedback, toasts, and DOM error notices
    let isRateLimited = false;
    let rateLimitMsg = "";
    let isModerationFlagged = false;
    let moderationMsg = "";
    let isAccountRestricted = false;
    let accountRestrictedMsg = "";
    let hasCaptchaChallenge = false;

    if (postApiErrorMsg) {
      const lowerApiErr = postApiErrorMsg.toLowerCase();
      if (lowerApiErr.includes("429") || lowerApiErr.includes("frequent") || lowerApiErr.includes("fast") || lowerApiErr.includes("rate") || lowerApiErr.includes("wait") || lowerApiErr.includes("limit")) {
        isRateLimited = true;
        rateLimitMsg = postApiErrorMsg;
      } else if (lowerApiErr.includes("ban") || lowerApiErr.includes("suspend") || lowerApiErr.includes("restrict") || lowerApiErr.includes("block")) {
        isAccountRestricted = true;
        accountRestrictedMsg = postApiErrorMsg;
      } else if (lowerApiErr.includes("captcha") || lowerApiErr.includes("verify") || lowerApiErr.includes("security")) {
        hasCaptchaChallenge = true;
      } else {
        isModerationFlagged = true;
        moderationMsg = postApiErrorMsg;
      }
    }

    try {
      const cfOrCaptcha = await page.$('#challenge-running, #challenge-stage, .cf-turnstile, iframe[src*="captcha" i], iframe[src*="turnstile" i], [class*="geetest" i], [class*="baxia" i]').catch(() => null);
      if (cfOrCaptcha && await cfOrCaptcha.isVisible().catch(() => false)) {
        hasCaptchaChallenge = true;
      }
    } catch (_) {}

    try {
      const feedbackContainers = await page.$$('[role="alert"], [class*="toast" i], [class*="notification" i], [class*="feedback" i], [class*="error" i], [class*="alert" i], [data-test="editor-error"], .editor-area, form');
      for (const fc of feedbackContainers) {
        if (await fc.isVisible().catch(() => false)) {
          const txt = (await fc.innerText().catch(() => "")).toLowerCase().trim();
          if (!txt) continue;

          // 1. Rate-limit triggers
          if (txt.includes("frequent") || txt.includes("too fast") || txt.includes("rate limit") || txt.includes("seconds before") || txt.includes("please wait") || txt.includes("try again later") || txt.includes("too many")) {
            isRateLimited = true;
            rateLimitMsg = txt;
            break;
          }

          // 2. Account ban or restriction triggers
          if (txt.includes("account suspended") || txt.includes("account restricted") || txt.includes("banned from commenting") || txt.includes("account blocked") || txt.includes("temporarily restricted")) {
            isAccountRestricted = true;
            accountRestrictedMsg = txt;
            break;
          }

          // 3. Moderation / content removal triggers
          if (txt.includes("prohibited") || txt.includes("violate") || txt.includes("guidelines") || txt.includes("forbidden") || txt.includes("restricted words") || txt.includes("cannot be posted") || txt.includes("under review") || txt.includes("spam detected") || txt.includes("failed to post") || txt.includes("post failed")) {
            isModerationFlagged = true;
            moderationMsg = txt;
            break;
          }
        }
      }
    } catch (_) {}

    if (hasCaptchaChallenge) {
      addLog("error", "CRITICAL: Captcha / security verification popup detected after clicking Post!");
      await saveDebugScreenshot(page, "post_submission_captcha");
      return { status: "captcha", message: "Captcha verification required on post submission" };
    }

    if (isAccountRestricted) {
      addLog("error", `CRITICAL: CoinMarketCap account restriction detected: "${accountRestrictedMsg.slice(0, 100)}". Halting posting to protect account.`);
      await saveDebugScreenshot(page, "account_restricted_submission");
      return { status: "expired", message: `Account restricted: ${accountRestrictedMsg.slice(0, 100)}` };
    }

    if (isRateLimited) {
      addLog("warning", `Rate limit warning detected near comment editor: "${rateLimitMsg.slice(0, 60)}"`);
      await saveDebugScreenshot(page, "rate_limited_submission");
      return { status: "retry", message: `Rate limited on submission (${rateLimitMsg.slice(0, 60)})` };
    }

    if (isModerationFlagged) {
      addLog("warning", `CoinMarketCap content moderation filter flagged comment: "${moderationMsg.slice(0, 80)}"`);
      await saveDebugScreenshot(page, "moderation_flagged_submission");
      return { status: "failed", message: `Moderation filter triggered: ${moderationMsg.slice(0, 80)}` };
    }

    // Check if comment now appears in the published community feed (STRICTLY EXCLUDING the comment editor input box!)
    // Also extract any direct /community/post/<id> permalink if rendered in the feed item
    const feedMatchResult = await page.evaluate((snip: string) => {
      if (!snip || snip.length < 6) return { matched: false, postHref: "" };
      const editors = Array.from(
        document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"], [data-test="comment-input"]')
      );
      const feedCandidates = Array.from(
        document.querySelectorAll(
          '[class*="community-post" i], [class*="post-item" i], [class*="comment-item" i], [class*="feed-item" i], [data-test*="post" i], article'
        )
      );
      for (const el of feedCandidates) {
        // Skip if this element is or contains the active comment editor
        if (editors.some((ed) => el === ed || el.contains(ed) || ed.contains(el))) continue;
        const txt = (el as HTMLElement).innerText || "";
        if (txt.includes(snip)) {
          const linkEl = el.querySelector('a[href*="/community/post/"]') as HTMLAnchorElement | null;
          return {
            matched: true,
            postHref: linkEl?.href || "",
          };
        }
      }
      return { matched: false, postHref: "" };
    }, snippetToVerify).catch(() => ({ matched: false, postHref: "" }));

    const postedInFeedAfterClick = feedMatchResult.matched;
    if (!createdPostUrl && feedMatchResult.postHref) {
      createdPostUrl = feedMatchResult.postHref;
    }

    // 1. If the comment text is still sitting inside the editor box, CoinMarketCap did not accept the submission.
    if (editorStillUnposted) {
      addLog("warning", `Submission failed: Comment text remained inside the editor after clicking Post (CoinMarketCap rejected or rate-limited the submission).`);
      await saveDebugScreenshot(page, "unverified_post_editor_not_cleared");
      return {
        status: "retry",
        message: "Submission not accepted by CoinMarketCap (comment remained in editor)"
      };
    }

    // 2. If a POST API call was observed and returned an error or non-zero status code, reject it.
    if (postApiObserved && !postApiSucceeded) {
      addLog("warning", `Submission API returned error (${postApiErrorMsg || "unconfirmed response"}).`);
      await saveDebugScreenshot(page, "unverified_post_api_response");
      return {
        status: "failed",
        message: postApiErrorMsg || "CoinMarketCap API rejected post submission"
      };
    }

    // 3. Require both editor cleared (!editorStillUnposted) AND either:
    //    (a) Explicit CMC comment-creation POST API success (postApiSucceeded), OR
    //    (b) Comment snippet rendered in the live community feed outside the editor (postedInFeedAfterClick)
    const commitConfirmed = postApiSucceeded || postedInFeedAfterClick;

    if (!commitConfirmed) {
      addLog("warning", "Submission failed: Editor cleared, but CoinMarketCap did not return a post creation confirmation or render the comment in the feed.");
      await saveDebugScreenshot(page, "unverified_post_no_signal");
      return {
        status: "failed",
        message: "Comment was not created on CoinMarketCap (no post creation response or feed match)"
      };
    }

    const finalTargetPostUrl = createdPostUrl || `${url.replace(/#.*$/, "")}#Community`;
    addLog("success", `Successfully submitted post on CoinMarketCap! Check link: ${finalTargetPostUrl}`);
    await saveDebugScreenshot(page, "success_post_screenshot");

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
      console.error("Failed to update and sync storage state after successful post:", (e as Error).message);
    }

    return { status: "success", message: "Posted successfully", postUrl: finalTargetPostUrl };
  } catch (error) {
    addLog("error", `Playwright posting execution failed: ${(error as Error).message}`);
    return { status: "failed", message: (error as Error).message };
  } finally {
    st.activePostingPage = null;
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser && ownsBrowser) {
      if (st.activePostingBrowser === browser) {
        st.activePostingBrowser = null;
      }
      await browser.close().catch(() => {});
    }
  }
}


export async function runRealPosting(url: string, message: string, sentiment: string, sharedBrowser?: any): Promise<{ status: "success" | "expired" | "captcha" | "failed" | "retry" | "skipped"; message: string; postUrl?: string }> {
  if (!url || url.includes("dex.coinmarketcap.com")) {
    addLog("warning", `Skipping DEX Scan URL: ${url} (DEX Scan pages do not support community postings)`);
    return { status: "skipped", message: "Cannot post on DEX Scan pages" };
  }

  return PlaywrightLock.acquire(async () => {
    const attempts = 2; // Reduced from 3 to 2 for faster execution cycle
    let lastResult: { status: "success" | "expired" | "captcha" | "failed" | "retry" | "skipped"; message: string; postUrl?: string } = { status: "failed", message: "Not started" };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (attempt > 1) {
          if (lastResult.status === "retry") {
            addLog("warning", `[RATE LIMIT DELAY] Submission rate limited. Waiting 30s before retry attempt ${attempt}/${attempts} to clear CoinMarketCap rate limit...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
          } else {
            addLog("warning", `[POST CONNECT RETRY] Connection or load failed. Retrying connect and post (Attempt ${attempt}/${attempts}) in 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        const rawResult = await runRealPostingInternal(url, message, sentiment, sharedBrowser);
        lastResult = rawResult as any;
        if (lastResult.status === "success" || lastResult.status === "captcha" || lastResult.status === "expired" || lastResult.status === "skipped") {
          return lastResult;
        }
        addLog("warning", `[POST CONNECT] Attempt ${attempt}/${attempts} returned status: ${lastResult.status} (${lastResult.message})`);
      } catch (err) {
        addLog("error", `[POST CONNECT] Exception on attempt ${attempt}: ${(err as Error).message}`);
        lastResult = { status: "failed", message: (err as Error).message };
      }
    }
    return lastResult;
  });
}
