/**
 * Debug screenshot script — figure out why React isn't rendering
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const EXECUTABLE_PATH = '/usr/bin/google-chrome';
const VIEWER_URL = 'http://127.0.0.1:9120';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
    ]
  });

  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  const logs = [];
  const errors = [];
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') errors.push(text);
    logs.push(`[${msg.type()}] ${text}`);
  });
  
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  await page.goto(VIEWER_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(6000);

  // Get full DOM
  const html = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 2000));
  console.log('HTML:\n', html);
  
  console.log('\nErrors:', errors.slice(0, 10));
  console.log('\nLogs:', logs.slice(0, 10));
  
  // Check root div
  const rootDiv = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      innerHTML: root?.innerHTML?.substring(0, 500),
      childCount: root?.childElementCount,
    };
  });
  console.log('\nRoot div:', JSON.stringify(rootDiv, null, 2));

  await page.screenshot({ path: '/home/rdpuser/.hermes/starcraft-dashboard/screenshots/debug.png', fullPage: false });
  console.log('Saved debug.png');
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
