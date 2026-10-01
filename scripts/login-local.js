const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function runLocalLogin() {
  console.log("=================================================");
  console.log("   CoinMarketCap Local Interactive Login Tool    ");
  console.log("=================================================");
  console.log("NOTE: Run this script on your LOCAL laptop/desktop (Windows/Mac).");
  console.log("Opening Chrome window...\n");

  const authDir = path.join(process.cwd(), "auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  const statePath = path.join(authDir, "state.json");

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"]
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log("1. Navigating to CoinMarketCap...");
  await page.goto("https://coinmarketcap.com", { waitUntil: "domcontentloaded" });

  console.log("2. Opening Login Modal...");
  const loginSelectors = [
    'button:has-text("Log In")',
    'button:has-text("Login")',
    'a:has-text("Log In")',
    'a:has-text("Login")',
    '[data-testid="header-login-button"]'
  ];

  for (const selector of loginSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn && await btn.isVisible()) {
        await btn.click();
        break;
      }
    } catch {}
  }

  console.log("\n>>> PLEASE LOG IN MANUALLY IN THE BROWSER WINDOW <<<");
  console.log(" - Enter your Email & Password (or Continue with Google/Binance)");
  console.log(" - Complete the Slide Puzzle / CAPTCHA on your screen");
  console.log(" - Complete 2FA / OTP verification code if requested");
  console.log("\nWaiting for successful login...");

  // Wait until user is logged in (either avatar/post button visible or storage state has auth token)
  let isLoggedIn = false;
  for (let i = 0; i < 180; i++) { // Wait up to 3 minutes
    await page.waitForTimeout(1000);
    const cookies = await context.cookies();
    const hasAuth = cookies.some(c => (c.name === "Authorization" || c.name === "u-prod") && c.value && c.value.length > 20);
    if (hasAuth) {
      isLoggedIn = true;
      break;
    }
  }

  if (isLoggedIn) {
    console.log("\n Authentication detected successfully!");
    await context.storageState({ path: statePath });
    console.log(`Saved authenticated session to: ${statePath}`);
    console.log("\nNEXT STEPS:");
    console.log("1. Open your bot dashboard at http://3.91.235.25/anup/");
    console.log("2. Go to 'Auth Configuration' -> 'Configure Cookie Session' -> 'Paste state.json cookies'");
    console.log("3. Paste the contents of auth/state.json and click Save!");
  } else {
    console.log("\nCould not verify login after 3 minutes. Please try again.");
  }

  await browser.close();
}

runLocalLogin().catch(err => {
  console.error("Error running login helper:", err.message);
});
