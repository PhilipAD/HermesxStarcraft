/**
 * Improved screenshot script with WebGL support
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const EXECUTABLE_PATH = '/usr/bin/google-chrome';
const VIEWER_URL = 'http://127.0.0.1:9120';
const BRIDGE_URL = 'http://127.0.0.1:9121';

async function main() {
  console.log('Taking screenshots with WebGL support...');

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
      '--disable-web-security',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();
  
  // Capture console messages
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') logs.push(`ERROR: ${msg.text()}`);
    if (msg.type() === 'warning') logs.push(`WARN: ${msg.text()}`);
  });

  await page.goto(VIEWER_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(5000);

  // Check for canvas
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: false };
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      found: true,
      width: canvas.width,
      height: canvas.height,
      hasWebGL: !!ctx,
      title: document.title,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  
  console.log('Canvas info:', JSON.stringify(canvasInfo, null, 2));

  // Screenshot
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'dashboard-webgl.png'),
    fullPage: false,
  });
  console.log('Saved: dashboard-webgl.png');

  // Check HUD content
  const hudContent = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    for (const d of divs) {
      const text = d.textContent || '';
      if (text.includes('HERMES') || text.includes('ENTS') || text.includes('FPS')) {
        return text.trim().substring(0, 200);
      }
    }
    return null;
  });
  
  console.log('HUD:', hudContent);

  // Console logs
  if (logs.length > 0) {
    console.log('Console logs:', logs.slice(0, 10).join('\n'));
  }

  // Now fetch and display the entity state
  try {
    const res = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json();
    }, `${BRIDGE_URL}/api/state`);
    
    console.log('\nEntity state from bridge:');
    console.log(`  Total entities: ${res.entities.length}`);
    
    const byType = {};
    res.entities.forEach(e => { byType[e.scType] = (byType[e.scType] || 0) + 1; });
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  } catch (e) {
    console.log('Bridge fetch error:', e.message);
  }

  await browser.close();
  
  // Also verify the screenshots exist
  const files = fs.readdirSync(SCREENSHOTS_DIR);
  for (const f of files) {
    const stat = fs.statSync(path.join(SCREENSHOTS_DIR, f));
    console.log(`\n  ${f}: ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
