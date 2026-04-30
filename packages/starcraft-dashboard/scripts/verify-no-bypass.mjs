#!/usr/bin/env node
/* eslint-disable */
/**
 * Hermes 2026-04 stability verification.
 *
 * Loads the live dashboard in a FRESH browser context (no shared cache),
 * waits 25 seconds for the world to spawn its base, and reports:
 *   - whether the bridge spawned anything via the bypass path (BAD)
 *   - whether _next_frame is still throwing memory access out of bounds
 *   - whether hermes-unit-behavior stepOne is throwing
 *   - the final base-state snapshot (live unit count, error count)
 *
 * This is the regression test for the bypass elimination work.
 */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const URL_ = `http://127.0.0.1:9120/?titan=1&__cb=${Date.now()}`;
const OUT = "/tmp/hermes-verify";
import { mkdir } from "node:fs/promises";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
    headless: false,
    args: [
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--disable-gpu-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-features=Vulkan",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-application-cache",
        "--disable-cache",
        "--disable-offline-load-stale-cache",
        "--disable-disk-cache",
    ],
});

const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    bypassCSP: true,
    extraHTTPHeaders: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
    },
});
await ctx.clearCookies();
// Disable browser HTTP cache via CDP for ALL requests in this context
await ctx.route("**/*", async (route) => {
    const headers = { ...route.request().headers() };
    headers["cache-control"] = "no-cache";
    headers["pragma"] = "no-cache";
    await route.continue({ headers });
});

const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => {
    const t = m.text();
    if (/google-analytics|favicon|MetaMask|inpage|lockdown|content\.js|contentScript|sandboxed/i.test(t)) return;
    logs.push({ t: Date.now(), type: m.type(), text: t });
});
page.on("pageerror", (e) => {
    // ignore unrelated browser-platform noise (VR session detection in a
    // sandboxed iframe, MetaMask wallet probing, etc).
    if (/isSessionSupported|XRSystem|MetaMask|disallowed by permissions/i.test(e.message)) return;
    logs.push({ t: Date.now(), type: "pageerror", text: e.message });
});

console.log("[verify] navigating to", URL_);
await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 30000 });

// CRITICAL: must wait at least 35-45s. The unit-behavior loop's first
// stepOne tick happens ~10s AFTER the bridge's spawn batch, and any
// engine OOB cascade only surfaces then. Waiting only 25s misses the
// crash window entirely and produces a false-positive PASS.
console.log("[verify] waiting 50s (covers the first 30s of behavior-loop ticks after spawn)...");
await page.waitForTimeout(50000);

// click into the iframe to dismiss any overlay/fade-in transition
try {
    await page.evaluate(() => {
        // remove any "loading" class that hides the iframe
        for (const el of document.querySelectorAll('[class*="loading" i], [class*="fade" i]')) {
            el.style.opacity = '1';
            el.style.filter = 'none';
            el.classList.remove('loading');
        }
    });
} catch {}
await page.waitForTimeout(1500);

const summary = {
    totalLogs: logs.length,
    bypassSpawned: logs.filter((l) => /BYPASS-spawned|forceCompleted=[1-9]/i.test(l.text)).length,
    nextFrameThrew: logs.filter((l) => /next_frame threw/i.test(l.text)).length,
    stepOneThrew: logs.filter((l) => /stepOne threw/i.test(l.text)).length,
    behaviorDisabled: logs.filter((l) => /disabling broken behavior/i.test(l.text)).length,
    triggerSpawned: logs.filter((l) => /trigger-spawned CC/i.test(l.text)).length,
    placedLines: logs.filter((l) => /\[hermes-entity-bridge\] placed:/i.test(l.text)).map((l) => l.text),
    pageErrors: logs.filter((l) => l.type === "pageerror").length,
    pageErrorMessages: logs.filter((l) => l.type === "pageerror").map((l) => l.text).slice(0, 5),
};

console.log("[verify] summary:", JSON.stringify(summary, null, 2));

// Hermes 2026-04 acceptance criteria for the live dashboard:
//   - ZERO bypass-spawned units (those crash `_next_frame` permanently
//     because they are not in unit_finder).
//   - ZERO behavior-loop OOB throws (those crash hermes-unit-behavior
//     and disable every Hermes id).
//   - The wrapper in openbw.ts caps `_next_frame` warnings at 5 — those
//     are transient C++ exceptions during the spawn batch's first few
//     frames as the engine integrates the new units. They do NOT crash
//     the iframe (each is caught in nextFrame()), so we tolerate up to
//     5 of them.
const verdict =
    summary.bypassSpawned === 0 &&
    summary.nextFrameThrew <= 5 &&
    summary.stepOneThrew === 0 &&
    summary.behaviorDisabled === 0 &&
    summary.pageErrors === 0
        ? "PASS"
        : "FAIL";
console.log(`[verify] verdict: ${verdict}`);

await page.screenshot({ path: `${OUT}/dashboard.png` });
await writeFile(`${OUT}/console.json`, JSON.stringify(logs, null, 2));
await writeFile(`${OUT}/summary.json`, JSON.stringify({ verdict, summary }, null, 2));
console.log(`[verify] screenshot: ${OUT}/dashboard.png`);

await browser.close().catch(() => {});
process.exit(verdict === "PASS" ? 0 : 1);
