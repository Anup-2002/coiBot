import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import type express from "express";
import { chromium } from "./config.ts";
import { st, getAvailableMarketingImages, getLocalBotSettings, addLog } from "./state.ts";
import { launchBrowserResilient } from "./browser.ts";

export function pruneMarketingImages(keepCount: number): { pruned: string[]; remaining: number } {
  try {
    const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");
    const images = getAvailableMarketingImages();
    if (images.length <= keepCount) {
      return { pruned: [], remaining: images.length };
    }

    const withMtime = images.map(filename => {
      const fullPath = path.join(st.MARKETING_IMAGES_DIR, filename);
      let mtime = 0;
      try {
        mtime = fs.statSync(fullPath).mtimeMs;
      } catch (_) {}
      return { filename, mtime };
    }).sort((a, b) => b.mtime - a.mtime);

    const toPrune = withMtime.slice(keepCount).map(x => x.filename);
    for (const filename of toPrune) {
      const outPath = path.join(st.MARKETING_IMAGES_DIR, filename);
      const pubPath = path.join(pubDir, filename);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
    }

    addLog("info", `[PRUNE] Auto-pruned ${toPrune.length} older marketing images, keeping latest ${keepCount}.`);
    return { pruned: toPrune, remaining: keepCount };
  } catch (err) {
    console.error("[PRUNE] Error pruning images:", err);
    return { pruned: [], remaining: getAvailableMarketingImages().length };
  }
}

export function isValidImageBuffer(buffer: Buffer): { valid: boolean; format?: string; error?: string } {
  if (!buffer || buffer.length < 16) {
    return { valid: false, error: "File buffer is too small or empty." };
  }
  // Max size: 12MB limit per image
  if (buffer.length > 12 * 1024 * 1024) {
    return { valid: false, error: "File exceeds 12MB maximum size limit." };
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { valid: true, format: "png" };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, format: "jpeg" };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { valid: true, format: "webp" };
  }

  // GIF: GIF8
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { valid: true, format: "gif" };
  }

  return { valid: false, error: "Invalid image format. Allowed formats: PNG, JPEG, WebP, GIF." };
}

export async function importImagesFromExternalSources(inputUrlOrText: string, replaceExisting: boolean = false): Promise<{
  importedCount: number;
  errors: string[];
  message: string;
}> {
  const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");
  if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) fs.mkdirSync(st.MARKETING_IMAGES_DIR, { recursive: true });
  if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

  if (replaceExisting) {
    const existing = getAvailableMarketingImages();
    for (const file of existing) {
      const outF = path.join(st.MARKETING_IMAGES_DIR, file);
      const pubF = path.join(pubDir, file);
      if (fs.existsSync(outF)) fs.unlinkSync(outF);
      if (fs.existsSync(pubF)) fs.unlinkSync(pubF);
    }
    addLog("info", `[IMAGES] Replaced existing images pool with new batch.`);
  }

  const errors: string[] = [];
  let importedCount = 0;

  const rawItems = inputUrlOrText
    .split(/[\r\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const rawItem of rawItems) {
    // 1. Google Drive Folder
    const gdriveFolderMatch = rawItem.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (gdriveFolderMatch) {
      const folderId = gdriveFolderMatch[1];
      addLog("info", `[DRIVE IMPORT] Scanning Google Drive folder (${folderId}) with headless engine...`);
      try {
        const browser = await launchBrowserResilient({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        });
        const context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        await page.goto(`https://drive.google.com/drive/folders/${folderId}`, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
        await page.waitForTimeout(4000);

        const fileIds: string[] = await page.evaluate(() => {
          const ids: string[] = [];
          document.querySelectorAll('a[href*="/file/d/"], [data-id]').forEach(el => {
            const href = el.getAttribute('href') || '';
            const match = href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match) ids.push(match[1]);
            const dataId = el.getAttribute('data-id');
            if (dataId && dataId.length > 20 && !ids.includes(dataId)) ids.push(dataId);
          });
          return Array.from(new Set(ids));
        });

        await browser.close().catch(() => {});
        addLog("info", `[DRIVE IMPORT] Found ${fileIds.length} candidate file entries in Google Drive folder.`);

        for (let i = 0; i < fileIds.length; i++) {
          const fid = fileIds[i];
          const downloadUrls = [
            `https://drive.google.com/uc?export=download&id=${fid}`,
            `https://lh3.googleusercontent.com/d/${fid}`
          ];
          let downloaded = false;
          for (const dUrl of downloadUrls) {
            try {
              const res = await fetch(dUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
              if (res.ok) {
                const arrayBuf = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);
                const validation = isValidImageBuffer(buffer);
                if (validation.valid) {
                  const ext = validation.format || "png";
                  const filename = `gdrive_${fid.slice(0, 8)}_${Date.now()}_${i + 1}.${ext}`;
                  fs.writeFileSync(path.join(st.MARKETING_IMAGES_DIR, filename), buffer);
                  fs.writeFileSync(path.join(pubDir, filename), buffer);
                  importedCount++;
                  downloaded = true;
                  addLog("success", `[DRIVE IMPORT] Imported image ${i + 1}/${fileIds.length} (${filename}, ${Math.round(buffer.length / 1024)} KB)`);
                  break;
                }
              }
            } catch (_) {}
          }
          if (!downloaded) {
            errors.push(`Google Drive file ${fid}: Not a public image or access restricted.`);
          }
        }
      } catch (driveErr) {
        errors.push(`Failed to scan Google Drive folder: ${(driveErr as Error).message}`);
        addLog("error", `[DRIVE IMPORT] Error scanning folder: ${(driveErr as Error).message}`);
      }
      continue;
    }

    // 2. Google Drive Single File
    const gdriveFileMatch = rawItem.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || rawItem.match(/id=([a-zA-Z0-9_-]+)/);
    if (gdriveFileMatch && rawItem.includes("drive.google.com")) {
      const fid = gdriveFileMatch[1];
      const downloadUrls = [
        `https://drive.google.com/uc?export=download&id=${fid}`,
        `https://lh3.googleusercontent.com/d/${fid}`
      ];
      let downloaded = false;
      for (const dUrl of downloadUrls) {
        try {
          const res = await fetch(dUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            const validation = isValidImageBuffer(buffer);
            if (validation.valid) {
              const ext = validation.format || "png";
              const filename = `gdrive_${fid.slice(0, 8)}_${Date.now()}.${ext}`;
              fs.writeFileSync(path.join(st.MARKETING_IMAGES_DIR, filename), buffer);
              fs.writeFileSync(path.join(pubDir, filename), buffer);
              importedCount++;
              downloaded = true;
              addLog("success", `[DRIVE IMPORT] Imported Google Drive image: ${filename}`);
              break;
            }
          }
        } catch (_) {}
      }
      if (!downloaded) {
        errors.push(`Google Drive file ${fid}: Could not download as valid image.`);
      }
      continue;
    }

    // 3. Direct URL / S3 Bucket URL / CDN Link
    if (rawItem.startsWith("http://") || rawItem.startsWith("https://")) {
      try {
        addLog("info", `[URL IMPORT] Fetching image from: ${rawItem.slice(0, 60)}...`);
        const res = await fetch(rawItem, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          redirect: 'follow'
        });
        if (!res.ok) {
          errors.push(`URL returned status ${res.status}: ${rawItem}`);
          continue;
        }
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const validation = isValidImageBuffer(buffer);
        if (!validation.valid) {
          errors.push(`Invalid image buffer from URL: ${validation.error} (${rawItem})`);
          continue;
        }

        const ext = validation.format || "png";
        let urlFilename = "image";
        try {
          const u = new URL(rawItem);
          const base = path.basename(u.pathname);
          if (base && base.includes(".")) urlFilename = base.replace(/[^a-zA-Z0-9._-]/g, "_");
          else urlFilename = `ext_${Date.now()}.${ext}`;
        } catch (_) {
          urlFilename = `ext_${Date.now()}.${ext}`;
        }
        if (!urlFilename.endsWith(`.${ext}`)) urlFilename += `.${ext}`;

        fs.writeFileSync(path.join(st.MARKETING_IMAGES_DIR, urlFilename), buffer);
        fs.writeFileSync(path.join(pubDir, urlFilename), buffer);
        importedCount++;
        addLog("success", `[URL IMPORT] Imported image: ${urlFilename} (${Math.round(buffer.length / 1024)} KB, ${ext.toUpperCase()})`);
      } catch (uErr) {
        errors.push(`Error downloading ${rawItem}: ${(uErr as Error).message}`);
        addLog("error", `[URL IMPORT] Failed to download from ${rawItem}: ${(uErr as Error).message}`);
      }
      continue;
    }

    errors.push(`Unrecognized link or format: ${rawItem}`);
  }

  // Auto-prune older images if requested or if auto-pruning is enabled
  const pruneLimit = getLocalBotSettings().autoPruneEnabled ? (getLocalBotSettings().autoPruneLimit || 30) : null;
  if (pruneLimit && pruneLimit > 0) {
    pruneMarketingImages(pruneLimit);
  }

  return {
    importedCount,
    errors,
    message: `Imported ${importedCount} image(s) successfully.` + (errors.length > 0 ? ` (${errors.length} failed/skipped)` : "")
  };
}

export async function runSystemDiagnosticsCheck(force = false): Promise<any> {
  const now = Date.now();
  if (!force && st.cachedSystemCheckResult && (now - st.cachedSystemCheckAt < 5 * 60 * 1000)) {
    return st.cachedSystemCheckResult;
  }

  const playwrightInstalled = typeof chromium !== "undefined";
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || "Not configured";
  
  let executablePath = "N/A";
  let executableExists = false;
  let launchStatus: "success" | "failed" = "failed";
  let message = "";
  let missingLibraries: string[] = [];

  if (playwrightInstalled) {
    try {
      executablePath = chromium.executablePath();
      executableExists = fs.existsSync(executablePath);
    } catch (err) {
      message = `Failed to get executable path: ${(err as Error).message}`;
    }
  }

  if (executableExists) {
    try {
      if (process.platform === "win32") {
        const testBrowser = await chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox"] });
        const ver = testBrowser.version();
        await testBrowser.close().catch(() => {});
        launchStatus = "success";
        message = `Chromium binary verified successfully: Chrome for Testing ${ver}`;
      } else {
        const output = execSync(`"${executablePath}" --version`, { stdio: "pipe", timeout: 5000 }).toString().trim();
        launchStatus = "success";
        message = `Chromium binary verified successfully: ${output}`;
      }
    } catch (err) {
      const errMsg = (err as Error).message || "";
      const stderr = (err as any).stderr?.toString() || "";
      const combinedError = `${errMsg} ${stderr}`;
      
      launchStatus = "failed";
      
      const libPattern = /lib[a-zA-Z0-9\.\-\_]+\.so\.[0-9]+/g;
      const foundLibs = combinedError.match(libPattern) || [];
      missingLibraries = Array.from(new Set(foundLibs));

      if (missingLibraries.length > 0) {
        message = `Missing required shared libraries: ${missingLibraries.join(", ")}`;
      } else if (combinedError.includes("cannot open shared object file")) {
        message = `Shared library error: ${combinedError}`;
      } else {
        message = `Launch verification failed: ${combinedError.substring(0, 300)}`;
      }
    }
  } else {
    message = "Chromium executable is not present on disk. It might need to be downloaded/installed.";
  }

  const result = {
    success: launchStatus === "success",
    playwrightInstalled,
    browsersPath,
    executablePath,
    executableExists,
    launchStatus,
    message,
    missingLibraries,
    checkedAt: new Date(now).toISOString(),
  };

  st.cachedSystemCheckResult = result;
  st.cachedSystemCheckAt = now;
  return result;
}

// Automatically warm up system diagnostics on server startup (outside Vitest) so /admin loads instantaneously
if (!process.env.VITEST) {
  setTimeout(() => {
    runSystemDiagnosticsCheck(true).catch(() => {});
  }, 500);
}

export function generateAdminToken(): string {
  const token = "admin_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
  st.activeAdminSessions.add(token);
  return token;
}

export function verifyAdminRequest(req: express.Request): boolean {
  const settings = getLocalBotSettings();
  if (settings.adminAuthEnabled === false) return true; // Disabled by admin

  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const tokenFromQuery = (req.query.token || req.query.access_token || req.query.key || req.query.pass) as string;
  const customHeader = req.headers["x-admin-token"] as string;
  const token = tokenFromHeader || customHeader || tokenFromQuery;

  if (!token) return false;

  const currentPassword = settings.adminPassword || process.env.ADMIN_PASSWORD || "admin123";
  if (token === currentPassword) {
    return true;
  }

  return st.activeAdminSessions.has(token);
}

export function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Neutralize CSV Formula Injection (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}
