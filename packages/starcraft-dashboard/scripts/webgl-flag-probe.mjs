#!/usr/bin/env node
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";

const server = http.createServer((req, res) => {
  if (req.url === "/webgl-probe.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(fs.readFileSync("/tmp/webgl-probe.html"));
    return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => server.listen(9128, "127.0.0.1", resolve));
const URL = "http://127.0.0.1:9128/webgl-probe.html";

const flagSets = [
  { name: "angle-swiftshader", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  { name: "swiftshader-webgl", args: ["--use-gl=swiftshader-webgl", "--enable-unsafe-swiftshader"] },
  { name: "swiftshader", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] },
  { name: "in-process-gpu", args: ["--in-process-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  { name: "single-process", args: ["--single-process", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  { name: "disable-gpu", args: ["--disable-gpu", "--enable-unsafe-swiftshader"] },
  { name: "vulkan", args: ["--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan", "--enable-unsafe-swiftshader"] },
];

const BASE = [
  "--no-first-run",
  "--disable-default-apps",
  "--disable-background-networking",
  "--ignore-gpu-blocklist",
  "--disable-gpu-sandbox",
  "--no-sandbox",
];

const results = [];
for (const set of flagSets) {
  process.stdout.write(`testing ${set.name}... `);
  let result = { name: set.name };
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: "/usr/bin/google-chrome",
      args: [...BASE, ...set.args],
    });
    const ctx = await browser.newContext({ viewport: { width: 400, height: 400 } });
    const page = await ctx.newPage();
    const consoles = [];
    page.on("console", (m) => consoles.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => consoles.push(`pageerror: ${e.message}`));
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1_500);
    const status = await page.evaluate(() => window.__webglProbeStatus || "no status");
    result.status = status;
    result.consoles = consoles;
    process.stdout.write("OK\n");
  } catch (e) {
    result.error = String(e && e.message || e);
    process.stdout.write(`ERR ${result.error.slice(0, 80)}\n`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  results.push(result);
}

console.log("\n=== summary ===");
for (const r of results) {
  console.log(`\n-- ${r.name} --`);
  if (r.error) console.log("ERROR:", r.error);
  if (r.status) console.log(r.status);
  if (r.consoles?.length) {
    for (const line of r.consoles.slice(0, 5)) {
      console.log(`  console:`, line.slice(0, 200));
    }
  }
}
server.close();
