#!/usr/bin/env python3
"""
CoinMarketCap Interactive Login & Session Exporter
Run on your laptop or machine with GUI to solve CAPTCHA/2FA and export auth/state.json.
"""
from pathlib import Path
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright is not installed. Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.sync_api import sync_playwright

AUTH_DIR = Path("auth")
AUTH_DIR.mkdir(exist_ok=True)
STATE_FILE = AUTH_DIR / "state.json"

print("=================================================")
print("   CoinMarketCap Playwright Interactive Login    ")
print("=================================================")
print("Launching Chromium browser window...\n")

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        args=["--start-maximized", "--disable-blink-features=AutomationControlled"]
    )

    context = browser.new_context(viewport=None)
    page = context.new_page()

    print("Opening CoinMarketCap...")
    page.goto("https://coinmarketcap.com", wait_until="domcontentloaded")
    time.sleep(2)

    print("Opening Log In modal...")
    login_selectors = [
        '[data-test="header-login-button"]',
        '[data-test="user-modal__login-tab"]',
        "text=Log In",
        "text=Login",
        "button:has-text('Log In')",
        "button:has-text('Login')",
        "a:has-text('Log In')",
        "a:has-text('Login')"
    ]

    for selector in login_selectors:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=3000):
                el.click()
                break
        except Exception:
            pass

    print("\n-------------------------------------------------")
    print(">>> PLEASE LOG IN IN THE BROWSER WINDOW <<<")
    print(" - Enter your Email & Password (or Google / Binance)")
    print(" - Solve any slide puzzle or CAPTCHA challenge")
    print(" - Enter any 2FA or email OTP code if asked")
    print("-------------------------------------------------")
    
    # Wait for user to complete login
    print("\nWaiting for you to complete login in the browser...")
    is_logged_in = False
    for _ in range(180): # Wait up to 3 minutes
        time.sleep(1)
        try:
            cookies = context.cookies()
            has_auth = any(
                (c.get("name") in ["Authorization", "u-prod"]) and len(c.get("value", "")) > 20
                for c in cookies
            )
            if has_auth:
                is_logged_in = True
                break
        except Exception:
            pass

    if not is_logged_in:
        try:
            input("\nPress ENTER after you have completed login in the browser...")
            is_logged_in = True
        except Exception:
            pass

    context.storage_state(path=str(STATE_FILE))

    print("\n=================================================")
    print(" Authentication saved successfully!")
    print(f"Saved state to: {STATE_FILE.resolve()}")
    print("=================================================")
    print("\nNext step:")
    print("Copy the contents of auth/state.json into your bot dashboard:")
    print("-> Auth Configuration -> Configure Cookie Session -> Paste state.json cookies")
    print("=================================================\n")

    browser.close()
