import http from "http";

function request(method: string, path: string, body?: any): Promise<{ status: number; headers: any; data: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === "string" ? body : JSON.stringify(body)) : "";
    const options: http.RequestOptions = {
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        let data: any = raw;
        try {
          data = JSON.parse(raw);
        } catch {}
        resolve({ status: res.statusCode || 0, headers: res.headers, data, raw });
      });
    });

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runValidation() {
  console.log("==================================================");
  console.log("RUNNING RIGOROUS END-TO-END SCENARIO VALIDATION");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = "") {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${detail}`);
      failed++;
    }
  }

  try {
    // 1. Initial Status Check
    console.log("\n--- Scenario 1: Bot Status & Engine Verification ---");
    const statusRes = await request("GET", "/api/status");
    assert(statusRes.status === 200, "GET /api/status returns HTTP 200", `Got ${statusRes.status}`);
    assert(typeof statusRes.data === "object", "Status response is an object");
    assert("status" in statusRes.data, "Status has 'status' field (e.g. Idle/Posting)");
    assert("totalCoins" in statusRes.data, "Status has 'totalCoins'");
    assert("dailyPostLimit" in statusRes.data, "Status has 'dailyPostLimit'");
    assert("isContinuousLoopActive" in statusRes.data, "Status has 'isContinuousLoopActive'");
    assert("runMode" in statusRes.data, "Status has 'runMode'");

    // 2. Anti-Leak Static Output Endpoints Check
    console.log("\n--- Scenario 2: Anti-Leak Output Interceptors & CSV Safeguards ---");
    const coinsRes = await request("GET", "/output/last_trending.json");
    assert(coinsRes.status === 200, "GET /output/last_trending.json returns 200");
    assert(Array.isArray(coinsRes.data), "last_trending.json returns array");

    const msgsRes = await request("GET", "/output/generated_messages.json");
    assert(msgsRes.status === 200, "GET /output/generated_messages.json returns 200");
    assert(Array.isArray(msgsRes.data), "generated_messages.json returns array");

    const resultsRes = await request("GET", "/output/results.json");
    assert(resultsRes.status === 200, "GET /output/results.json returns 200");
    assert(Array.isArray(resultsRes.data), "results.json returns array");

    const csvTrending = await request("GET", "/api/download/trending_coins.csv");
    assert(csvTrending.status === 200, "GET /api/download/trending_coins.csv returns 200");
    assert(csvTrending.headers["content-type"]?.includes("text/csv"), "Trending CSV has text/csv header");

    const csvComments = await request("GET", "/api/download/generated_comments.csv");
    assert(csvComments.status === 200, "GET /api/download/generated_comments.csv returns 200");
    assert(csvComments.headers["content-type"]?.includes("text/csv"), "Comments CSV has text/csv header");

    const csvSubs = await request("GET", "/api/download/post_submissions.csv");
    assert(csvSubs.status === 200, "GET /api/download/post_submissions.csv returns 200");
    assert(csvSubs.headers["content-type"]?.includes("text/csv"), "Submissions CSV has text/csv header");

    const csvReport = await request("GET", "/api/download/overall_report.csv");
    assert(csvReport.status === 200, "GET /api/download/overall_report.csv returns 200");
    assert(csvReport.headers["content-type"]?.includes("text/csv"), "Overall report CSV has text/csv header");

    // 3. System Diagnostics & Health Endpoints
    console.log("\n--- Scenario 3: System Diagnostics & Health Endpoints ---");
    const sysCheck = await request("GET", "/api/check-system");
    assert(sysCheck.status === 200, "GET /api/check-system returns 200");
    assert(sysCheck.data.success === true, "check-system success is true");
    assert(sysCheck.data.executableExists === true, "check-system validates Chromium executable");

    const envCheck = await request("GET", "/api/verify-env");
    assert(envCheck.status === 200, "GET /api/verify-env returns 200");
    assert(envCheck.data.status === "ok", "verify-env status is ok");
    assert(typeof envCheck.data.aiProviders === "object", "verify-env includes aiProviders");
    assert("openai" in envCheck.data.aiProviders, "verify-env includes openai provider");
    assert("gemini" in envCheck.data.aiProviders, "verify-env includes gemini provider");

    const logsCheck = await request("GET", "/api/logs");
    assert(logsCheck.status === 200, "GET /api/logs returns 200");
    assert(Array.isArray(logsCheck.data.logs), "GET /api/logs returns logs array");
    assert(logsCheck.data.logs.length > 0, "logs array contains system audit trail");

    // 4. Profiles & Session Management
    console.log("\n--- Scenario 4: Multi-Account Profiles CRUD & Session Management ---");
    const profilesRes = await request("GET", "/api/profiles");
    assert(profilesRes.status === 200, "GET /api/profiles returns 200");
    const existingProfiles: any[] = Array.isArray(profilesRes.data)
      ? profilesRes.data
      : (profilesRes.data?.profiles || []);
    assert(Array.isArray(existingProfiles), "Profiles endpoint returns list of accounts");

    // Save/Update active profile or new profile
    const activeProfile = existingProfiles.find((p) => p.isActive) || existingProfiles[0];
    assert(!!activeProfile, "Active profile is identified");

    if (activeProfile) {
      // Test updating daily limit
      const currentLimit = activeProfile.dailyPostLimit || 500;
      const newLimit = currentLimit === 500 ? 600 : 500;
      const updateLimitRes = await request("POST", "/api/update-profile-limit", {
        id: activeProfile.id,
        dailyPostLimit: newLimit,
      });
      assert(updateLimitRes.status === 200, "POST /api/update-profile-limit succeeds", `Status ${updateLimitRes.status}`);
      assert(updateLimitRes.data.dailyPostLimit === newLimit, `Daily limit updated to ${newLimit}`);

      // Test activating profile
      const actRes = await request("POST", "/api/activate-profile", {
        id: activeProfile.id,
      });
      assert(actRes.status === 200, "POST /api/activate-profile succeeds", `Status ${actRes.status}`);
      assert(actRes.data.success === true, "activate-profile returns success true");
    }

    // Test creating a new profile if under limit of 5
    if (existingProfiles.length < 5) {
      const testId = "e2e_temp_acc_" + Math.floor(Math.random() * 10000);
      const dummyState = JSON.stringify({ cookies: [{ name: "test_cookie", value: "123", domain: ".coinmarketcap.com", path: "/" }], origins: [] });
      const saveRes = await request("POST", "/api/save-profile", {
        id: testId,
        name: "Test Bot Account " + testId,
        stateJson: dummyState,
        dailyPostLimit: 250,
      });
      assert(saveRes.status === 200, "POST /api/save-profile succeeds for valid stateJson payload");

      const delRes = await request("POST", "/api/delete-profile", {
        id: testId,
      });
      assert(delRes.status === 200, "POST /api/delete-profile cleanly removes temporary account");
    } else {
      console.log("[INFO] 5 profiles already exist, profile count guard active.");
    }

    // 5. Run Modes & Continuous Loop Settings
    console.log("\n--- Scenario 5: Mode Settings & Loop Controls ---");
    const setLoopRes = await request("POST", "/api/set-continuous-loop", {
      active: false,
    });
    assert(setLoopRes.status === 200, "POST /api/set-continuous-loop (disable) returns 200");

    const setModeHeadless = await request("POST", "/api/set-run-mode", {
      mode: "headless",
    });
    assert(setModeHeadless.status === 200, "POST /api/set-run-mode (headless) returns 200");

    const setModeBrowser = await request("POST", "/api/set-run-mode", {
      mode: "browser",
    });
    assert(setModeBrowser.status === 200, "POST /api/set-run-mode (browser) returns 200");

    // 6. Marketing Images APIs
    console.log("\n--- Scenario 6: Marketing Images Operations ---");
    const getImagesRes = await request("GET", "/api/marketing-images");
    assert(getImagesRes.status === 200, "GET /api/marketing-images returns 200");
    assert(Array.isArray(getImagesRes.data.images), "Marketing images endpoint returns images array");

    const pruneRes = await request("POST", "/api/marketing-images/auto-prune", {});
    assert(pruneRes.status === 200, "POST /api/marketing-images/auto-prune returns 200");

    // 7. Scheduler API
    console.log("\n--- Scenario 7: Scheduler Operations & Rotation Control ---");
    const schedRes = await request("GET", "/api/scheduler");
    assert(schedRes.status === 200, "GET /api/scheduler returns 200");
    assert("enabled" in schedRes.data || "settings" in schedRes.data, "scheduler status contains scheduler state");

    const filesInfoRes = await request("GET", "/api/scheduler/files-info");
    assert(filesInfoRes.status === 200, "GET /api/scheduler/files-info returns 200");

    const schedLogsRes = await request("GET", "/api/scheduler/logs");
    assert(schedLogsRes.status === 200, "GET /api/scheduler/logs returns 200");

    const schedSettingsRes = await request("POST", "/api/scheduler/settings", {
      enabled: false,
      intervalMinutes: 60,
    });
    assert(schedSettingsRes.status === 200, "POST /api/scheduler/settings returns 200");

    // 8. Graceful Stop Posting Safety Control
    console.log("\n--- Scenario 8: Graceful Stop Posting Safety Control ---");
    const stopRes = await request("POST", "/api/stop-posting");
    assert(stopRes.status === 200, "POST /api/stop-posting returns 200");

    // 9. Verify Current Coins and Messages State
    console.log("\n--- Scenario 9: Current Data Integrity Check ---");
    const finalStatus = await request("GET", "/api/status");
    assert(finalStatus.status === 200, "Final /api/status returns 200");
    assert(finalStatus.data.totalCoins > 0, `Total coins verified in system: ${finalStatus.data.totalCoins}`);
    const genCount = finalStatus.data.generatedMessages ?? finalStatus.data.totalGenerated ?? 0;
    assert(genCount > 0, `Total generated messages verified in system: ${genCount}`);

  } catch (err: any) {
    console.error("FATAL ERROR DURING E2E VALIDATION:", err);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`E2E SCENARIO VALIDATION COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runValidation();
