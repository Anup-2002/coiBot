import { type Coin } from "./config.ts";
import { st } from "./state.ts";
import { addLog } from "./logger.ts";
import { writeJsonFile } from "./files.ts";
import { getLocalBotSettings, updateRealFetchTime, saveBotProgress } from "./settings.ts";
import { withTimeout, PlaywrightLock, launchBrowserResilient, setupPageResourceBlocking } from "./browser.ts";

export async function resolveToFirstPartyUrl(originalUrl: string, symbol: string, name: string): Promise<string> {
  if (!originalUrl || !originalUrl.includes("dex.coinmarketcap.com")) {
    return originalUrl;
  }

  addLog("info", `Target URL is on DEX Scan: ${originalUrl}. Resolving to standard CoinMarketCap Currencies URL...`);
  
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  };

  let matchedSlug: string | null = null;

  // Step 1: Try searching Suggest API by token contract address extracted from DEX URL
  try {
    const parts = originalUrl.split("/").filter(Boolean);
    const address = parts[parts.length - 1];
    if (address && address.length > 5 && !address.includes(".") && !address.includes("coinmarketcap")) {
      addLog("info", `Searching CMC Suggest API by token contract address: ${address}...`);
      const apiRes = await fetch(`https://api.coinmarketcap.com/data-api/v3/search/suggest?keyword=${encodeURIComponent(address)}`, { headers });
      if (apiRes.ok) {
        const json = await apiRes.json() as any;
        const suggestions = json?.data?.cryptoSuggestions || [];
        if (suggestions.length > 0 && suggestions[0].slug) {
          matchedSlug = suggestions[0].slug;
          addLog("info", `Found slug via contract address search: ${matchedSlug}`);
        }
      }
    }
  } catch (err) {
    addLog("warning", `Error searching by contract address: ${(err as Error).message}`);
  }

  // Step 2: Try Suggest API by symbol
  if (!matchedSlug) {
    try {
      const apiRes = await fetch(`https://api.coinmarketcap.com/data-api/v3/search/suggest?keyword=${encodeURIComponent(symbol)}`, { headers });
      if (apiRes.ok) {
        const json = await apiRes.json() as any;
        const suggestions = json?.data?.cryptoSuggestions || [];
        const matched = suggestions.find((s: any) => 
          s.symbol?.toLowerCase() === symbol.toLowerCase() || 
          s.name?.toLowerCase() === name.toLowerCase()
        );
        if (matched && matched.slug) {
          matchedSlug = matched.slug;
          addLog("info", `Found slug via symbol search: ${matchedSlug}`);
        }
      }
    } catch (err) {
      addLog("warning", `Error with Suggest API: ${(err as Error).message}`);
    }
  }

  // Step 3: Verify the resolved slug and build standard URL
  if (matchedSlug) {
    const resolvedUrl = `https://coinmarketcap.com/currencies/${matchedSlug}/`;
    // Verify resolved URL exists by fetching it
    const checkRes = await fetch(resolvedUrl, { method: "HEAD", headers }).catch(() => null);
    if (checkRes && checkRes.status === 200) {
      addLog("success", `Successfully resolved DEX token to active first-party URL: ${resolvedUrl}`);
      return resolvedUrl;
    }
  }

  // Fallback 1: try constructing slug directly and checking if it exists
  const cleanSlug = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  
  const constructedUrl = `https://coinmarketcap.com/currencies/${cleanSlug}/`;
  try {
    const checkRes = await fetch(constructedUrl, { method: "HEAD", headers }).catch(() => null);
    if (checkRes && checkRes.status === 200) {
      addLog("success", `Resolved to constructed first-party URL: ${constructedUrl}`);
      return constructedUrl;
    }
  } catch {}

  // Fallback 2: try appending the symbol or chain
  const constructedUrlWithSymbol = `https://coinmarketcap.com/currencies/${cleanSlug}-${symbol.toLowerCase()}/`;
  try {
    const checkRes = await fetch(constructedUrlWithSymbol, { method: "HEAD", headers }).catch(() => null);
    if (checkRes && checkRes.status === 200) {
      addLog("success", `Resolved to constructed first-party URL with symbol: ${constructedUrlWithSymbol}`);
      return constructedUrlWithSymbol;
    }
  } catch {}

  // If all first-party verification checks fail, we fall back to the original DEX URL
  addLog("warning", `Could not find verified first-party URL for ${name} (${symbol}). Reverting to original DEX URL.`);
  return originalUrl;
}

export async function fetchTrendingByScrape(): Promise<Coin[]> {
  return PlaywrightLock.acquire(async () => {
    addLog("info", "Launching Playwright to scrape real trending data from CoinMarketCap...");
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
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      const page = await context.newPage();
      await setupPageResourceBlocking(page);
      addLog("info", "Navigating to: https://coinmarketcap.com/trending-cryptocurrencies/");
      await page.goto("https://coinmarketcap.com/trending-cryptocurrencies/", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      // Wait for the page/table to settle down
      await page.waitForTimeout(3000);
      
      const title = await page.title().catch(() => "");
      if (title.includes("Cloudflare") || title.includes("Just a moment")) {
        throw new Error("Cloudflare challenge encountered during scraping.");
      }

      addLog("info", "Scrolling page to load full trending table...");
      await page.evaluate("window.scrollBy(0, 500)");
      await page.waitForTimeout(1000);
      await page.evaluate("window.scrollBy(0, 500)");
      await page.waitForTimeout(1000);

      const coins = await page.evaluate(`(() => {
        try {
          const parseAbbreviatedNumber = (str) => {
            if (!str) return 0;
            const clean = str.replace(/[^0-9.KMBTkmbt]/g, '').toUpperCase();
            let val = parseFloat(clean) || 0;
            if (clean.endsWith('K')) val *= 1000;
            else if (clean.endsWith('M')) val *= 1000000;
            else if (clean.endsWith('B')) val *= 1000000000;
            else if (clean.endsWith('T')) val *= 1000000000000;
            return val;
          };

          const tables = Array.from(document.querySelectorAll("table"));
          const mainTable = tables.find(t => t.querySelectorAll("tbody tr").length > 5);
          if (!mainTable) return [];

          const rows = Array.from(mainTable.querySelectorAll("tbody tr"));
          const result = [];

          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length < 5) continue;

            const rankText = cells[1] ? cells[1].textContent.trim() : "";
            const rank = parseInt(rankText) || (result.length + 1);

            const nameCell = cells[2];
            if (!nameCell) continue;

            const nameEl = nameCell.querySelector('.base-text');
            const symbolEl = nameCell.querySelector('.sub-info');
            
            let name = nameEl ? nameEl.textContent.trim() : "";
            let symbol = symbolEl ? symbolEl.textContent.trim() : "";

            const link = nameCell.querySelector('a');
            const href = link ? link.getAttribute('href') : "";

            // If name/symbol not found via classes, try fallback parsing
            if (!name) {
              const text = nameCell.textContent.trim();
              name = text;
              symbol = text;
            }

            let url = "";
            let slug = "";
            if (href) {
              if (href.startsWith("http")) {
                url = href;
                // Extract slug from URL if possible
                const match = href.match(/\\/currencies\\/([^/]+)/) || href.match(/token\\/([^/]+)\\/([^/]+)/);
                slug = match ? match[1] : name.toLowerCase().replace(/\\s+/g, '-');
              } else {
                url = "https://coinmarketcap.com" + href;
                const match = href.match(/\\/currencies\\/([^/]+)/);
                slug = match ? match[1] : name.toLowerCase().replace(/\\s+/g, '-');
              }
            } else {
              slug = name.toLowerCase().replace(/\\s+/g, '-');
              url = "https://coinmarketcap.com/currencies/" + slug + "/";
            }

            const priceText = cells[3] ? cells[3].textContent.trim() : "$0";
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

            const h1Text = cells[4] ? cells[4].textContent.trim() : "0%";
            let change_1h = parseFloat(h1Text.replace(/[^0-9.]/g, '')) || 0;
            if (cells[4] && (cells[4].innerHTML.includes('caret-down') || cells[4].innerHTML.includes('icon-Caret-down'))) {
              change_1h = -change_1h;
            }

            const h24Text = cells[5] ? cells[5].textContent.trim() : "0%";
            let change_24h = parseFloat(h24Text.replace(/[^0-9.]/g, '')) || 0;
            if (cells[5] && (cells[5].innerHTML.includes('caret-down') || cells[5].innerHTML.includes('icon-Caret-down'))) {
              change_24h = -change_24h;
            }

            const mcText = cells[6] ? cells[6].textContent.trim() : "$0";
            const market_cap = parseAbbreviatedNumber(mcText);

            const volText = cells[7] ? cells[7].textContent.trim() : "$0";
            const volume_24h = parseAbbreviatedNumber(volText);

            result.push({
              name,
              symbol,
              price,
              change_1h,
              change_24h,
              change_7d: 0,
              market_cap,
              volume_24h,
              cmc_rank: rank,
              slug,
              url
            });
          }

          return result;
        } catch (e) {
          return [];
        }
      })()`) as Coin[];

      if (coins && coins.length > 0) {
        addLog("success", `Successfully scraped ${coins.length} trending coins directly from CoinMarketCap!`);
        return coins;
      } else {
        throw new Error("Scraped page but found 0 coins in trending list.");
      }
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  });
}

export async function executeFetchTrending(options?: { skipSaveToActiveProfile?: boolean }): Promise<{ coins: Coin[]; creditCount: number }> {
  let coins: Coin[] = [];
  let creditCount = 0;

  try {
    coins = await withTimeout(
      fetchTrendingByScrape(),
      120000,
      "Playwright launch or scrape timed out after 120 seconds"
    );
    if (coins && coins.length > 0) {
      addLog("success", `[SOURCE: CMC SCRAPE] Successfully scraped ${coins.length} trending coins directly from CoinMarketCap.`);
    }
  } catch (scrapeErr) {
    addLog("warning", `CoinMarketCap scrape failed: ${(scrapeErr as Error).message}. Attempting fallback market source...`);
  }

  if (coins.length === 0) {
    if (process.env.CMC_API_KEY) {
      addLog("info", "Scrape failed, falling back to CoinMarketCap listings (top by market cap).");
      try {
        const response = await fetch("https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=100&convert=USD", {
          headers: {
            "Accepts": "application/json",
            "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
          }
        });

        if (!response.ok) {
          addLog("warning", `CoinMarketCap Pro API returned error status: ${response.status}. Attempting CoinGecko fallback...`);
        } else {
          const resData = (await response.json()) as any;
          creditCount = resData.status?.credit_count || 1;
          
          if (resData.data && Array.isArray(resData.data)) {
            coins = resData.data.map((coin: any) => ({
              name: coin.name,
              symbol: coin.symbol,
              price: parseFloat(coin.quote?.USD?.price?.toFixed(6) || "0"),
              change_24h: parseFloat(coin.quote?.USD?.percent_change_24h?.toFixed(2) || "0"),
              change_1h: parseFloat(coin.quote?.USD?.percent_change_1h?.toFixed(2) || "0"),
              change_7d: parseFloat(coin.quote?.USD?.percent_change_7d?.toFixed(2) || "0"),
              market_cap: parseFloat(coin.quote?.USD?.market_cap?.toFixed(2) || "0"),
              volume_24h: parseFloat(coin.quote?.USD?.volume_24h?.toFixed(2) || "0"),
              cmc_rank: coin.cmc_rank,
              slug: coin.slug,
              url: `https://coinmarketcap.com/currencies/${coin.slug}/`,
            }));
            addLog("success", `[SOURCE: CMC PRO API] Fetched ${coins.length} coins from CoinMarketCap Pro API.`);
          }
        }
      } catch (cmcErr) {
        addLog("warning", `CoinMarketCap Pro API fetch failed: ${(cmcErr as Error).message}. Attempting CoinGecko fallback...`);
      }
    }

    if (coins.length === 0) {
      addLog("info", "Scrape failed, falling back to CoinGecko markets (top by market cap).");
      
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d");
        
        if (response.ok) {
          const cgData = (await response.json()) as any;
          if (Array.isArray(cgData) && cgData.length > 0) {
            coins = cgData.map((coin: any, index: number) => ({
              name: coin.name,
              symbol: coin.symbol.toUpperCase(),
              price: coin.current_price,
              change_24h: parseFloat(coin.price_change_percentage_24h?.toFixed(2) || "0"),
              change_1h: parseFloat(coin.price_change_percentage_1h_in_currency?.toFixed(2) || "0"),
              change_7d: parseFloat(coin.price_change_percentage_7d_in_currency?.toFixed(2) || "0"),
              market_cap: coin.market_cap,
              volume_24h: coin.total_volume,
              cmc_rank: index + 1,
              slug: coin.id,
              url: `https://coinmarketcap.com/currencies/${coin.id}/`,
            }));
            addLog("success", `[SOURCE: COINGECKO] Successfully fetched ${coins.length} top market cap coins from CoinGecko API.`);
          }
        }
      } catch (cgErr) {
        addLog("warning", `CoinGecko fetch failed: ${(cgErr as Error).message}`);
      }

      if (coins.length === 0) {
        addLog("error", "All coin sources failed.");
        throw new Error("Could not fetch trending coins from any source (scrape, CMC API, CoinGecko). Keeping previous coin list.");
      }
    }
  }

  // Pre-resolve and filter out DEX scan URLs that cannot be resolved to standard CMC currencies pages.
  const resolvedCoins: Coin[] = [];
  for (const coin of coins) {
    if (coin.url && coin.url.includes("dex.coinmarketcap.com")) {
      addLog("info", `Pre-resolving DEX Scan URL for ${coin.name} (${coin.symbol})...`);
      const resolvedUrl = await resolveToFirstPartyUrl(coin.url, coin.symbol, coin.name);
      if (resolvedUrl && !resolvedUrl.includes("dex.coinmarketcap.com")) {
        coin.url = resolvedUrl;
        const match = resolvedUrl.match(/\/currencies\/([^/]+)/);
        if (match) {
          coin.slug = match[1];
        }
        resolvedCoins.push(coin);
      } else {
        addLog("warning", `Excluding DEX token ${coin.name} (${coin.symbol}) from queue: Does not have a standard community currencies page.`);
      }
    } else {
      resolvedCoins.push(coin);
    }
  }

  if (resolvedCoins.length === 0) {
    addLog("error", "All coin sources failed.");
    throw new Error("Could not fetch trending coins from any source (scrape, CMC API, CoinGecko). Keeping previous coin list.");
  }

  const settings = getLocalBotSettings();
  const targetCount = typeof settings.targetCoinsCount === "number" ? settings.targetCoinsCount : 0;
  const targetedCoins = targetCount > 0 ? resolvedCoins.slice(0, targetCount) : resolvedCoins;

  if (!options?.skipSaveToActiveProfile) {
    await writeJsonFile(st.LAST_TRENDING_FILE, targetedCoins);
    updateRealFetchTime();
    // Clear obsolete comments from previous batch so data is never inconsistent
    await writeJsonFile(st.GENERATED_MESSAGES_FILE, []);
    saveBotProgress({ next_index: 0 });
    st.currentPostingIndex = 0;
  }
  return { coins: targetedCoins, creditCount };
}
