import { fs, app } from "../config.ts";
import { st } from "../state.ts";
import { addLog } from "../logger.ts";
import { readJsonFile, saveProfilesCloudIfChanged } from "../files.ts";
import { acquireProcessLock, releaseProcessLock, isBusy } from "../locks.ts";
import { checkLoginReal, executeStartLogin, executeSubmitOtp, executeCancelLogin } from "../login.ts";


// 5. Check login session (Runs real headless Playwright against CoinMarketCap)
app.post("/api/check-login", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot check session while the Continuous Automation Loop is active." });
  }
  const lock = acquireProcessLock("checking_login", "Verifying CoinMarketCap session");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }
  addLog("info", "Checking live login session validity on CoinMarketCap using Playwright...");
  st.botStatus = "Checking Login";

  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  if (!sessionExists) {
    releaseProcessLock("checking_login");
    addLog("error", "Login check failed: auth/state.json does not exist. Please upload active session cookies.");
    st.botStatus = "Idle";
    
    try {
      let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloudIfChanged(profiles);
      }
    } catch (_) {}

    return res.json({ status: "expired", message: "auth/state.json missing" });
  }

  try {
    const result = await checkLoginReal();
    
    // Update active profile loginStatus
    try {
      let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = result.status === "success" ? "logged_in" : "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloudIfChanged(profiles);
      }
    } catch (err) {
      console.error("Error updating profile status in check-login:", (err as Error).message);
    }

    st.botStatus = "Idle";
    return res.json(result);
  } catch (err) {
    addLog("error", `Real login verification failed: ${(err as Error).message}`);
    st.botStatus = "Idle";

    try {
      let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloudIfChanged(profiles);
      }
    } catch (_) {}

    return res.json({ status: "failed", message: (err as Error).message });
  } finally {
    releaseProcessLock("checking_login");
  }
});

// 5.1. Start interactive credential login
app.post("/api/start-login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password." });
  }

  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot start login while the Continuous Automation Loop is active." });
  }
  if (isBusy() || st.activeSystemProcess !== "none") {
    return res.status(409).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  const lock = acquireProcessLock("authenticating", "Interactive credential login");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  // 1. Check profiles
  let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const existingProfile = profiles.find(p => p.name.toLowerCase() === email.toLowerCase());

  // 2. Check if we reached the maximum of 5 accounts only if creating a new profile
  if (!existingProfile && profiles.length >= 5) {
    releaseProcessLock("authenticating");
    return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
  }

  st.botStatus = "Authenticating";
  st.loginState = { status: "authenticating", message: "Initializing secure credentials login flow..." };

  // Run asynchronously in background to prevent 504 Gateway Timeout on AWS/Nginx proxy
  executeStartLogin(email, password)
    .then((result) => {
      const mappedStatus = result.status === "requires_otp" ? "requires_otp" : (result.status === "success" ? "success" : "failed");
      st.loginState = { status: mappedStatus, message: result.message };
      if (result.status !== "requires_otp") {
        st.botStatus = "Idle";
        releaseProcessLock("authenticating");
      } else {
        st.botStatus = "Verifying Code";
      }
    })
    .catch((error) => {
      st.botStatus = "Idle";
      releaseProcessLock("authenticating");
      st.loginState = { status: "failed", message: (error as Error).message };
    });

  return res.json({ status: "authenticating", message: "Automated login flow initiated. Please wait..." });
});

// 5.2. Submit OTP / Verification Code
app.post("/api/submit-otp", async (req, res) => {
  const { otp } = req.body;
  if (!otp) {
    return res.status(400).json({ error: "Missing OTP verification code." });
  }

  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot submit OTP while the Continuous Automation Loop is active." });
  }

  st.botStatus = "Verifying Code";
  st.loginState = { status: "authenticating", message: "Submitting 6-digit verification code..." };

  // Run asynchronously in background to prevent 504 Gateway Timeout on AWS/Nginx proxy
  executeSubmitOtp(otp)
    .then((result) => {
      releaseProcessLock("authenticating");
      st.loginState = { status: result.status, message: result.message };
      st.botStatus = "Idle";
      if (result.status === "success") {
        setTimeout(() => {
          if (st.loginState.status === "success") {
            st.loginState = { status: "idle", message: "" };
          }
        }, 15000);
      }
    })
    .catch((error) => {
      releaseProcessLock("authenticating");
      st.botStatus = "Idle";
      st.loginState = { status: "failed", message: (error as Error).message };
    });

  return res.json({ status: "authenticating", message: "OTP submission initiated. Please wait..." });
});

// 5.3. Cancel active login session
app.post("/api/cancel-login", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot cancel login while the Continuous Automation Loop is active." });
  }
  releaseProcessLock("authenticating");
  try {
    await executeCancelLogin();
    st.botStatus = "Idle";
    st.loginState = { status: "idle", message: "Login session cancelled." };
    return res.json({ success: true, message: "Login session cancelled." });
  } catch (error) {
    st.botStatus = "Idle";
    st.loginState = { status: "idle", message: (error as Error).message };
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 5.3b. Reset login state to idle cleanly (for logging into another account)
app.post("/api/reset-login-state", async (req, res) => {
  releaseProcessLock("authenticating");
  try {
    if (st.activeLoginSession) {
      await st.activeLoginSession.browser.close().catch(() => {});
      st.activeLoginSession = null;
    }
  } catch (_) {}
  st.botStatus = "Idle";
  st.loginState = { status: "idle", message: "" };
  return res.json({ success: true, message: "Login state reset to idle." });
});

