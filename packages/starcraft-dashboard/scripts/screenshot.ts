/**
 * Screenshot script — takes screenshots of the Hermes StarCraft Dashboard
 * and saves them to the screenshots directory.
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

async function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Hermes StarCraft Dashboard — Screenshots   ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Check bridge
  console.log('[1/4] Checking bridge...');
  const bridgeOk = await waitForServer(`${BRIDGE_URL}/api/health`);
  if (!bridgeOk) {
    console.error('[ERROR] Bridge not available at', BRIDGE_URL);
    process.exit(1);
  }
  console.log('[OK] Bridge is running');

  // Check viewer
  console.log('[2/4] Checking viewer...');
  const viewerOk = await waitForServer(VIEWER_URL);
  if (!viewerOk) {
    console.error('[ERROR] Viewer not available at', VIEWER_URL);
    process.exit(1);
  }
  console.log('[OK] Viewer is running');

  // Launch browser
  console.log('[3/4] Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // ─── Screenshot 1: Main dashboard ────────────────────────────────────────
  console.log('[4/4] Taking screenshots...');
  
  try {
    await page.goto(VIEWER_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(4000); // Wait for Three.js to render
    
    const canvas = await page.$('canvas');
    if (canvas) {
      console.log('[OK] Canvas element found - Three.js is rendering');
    } else {
      console.log('[WARN] No canvas found - checking DOM...');
    }

    // Screenshot main view
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'dashboard-main.png'),
      fullPage: false,
    });
    console.log('[OK] Saved: dashboard-main.png');

    // Check HUD elements
    const hud = await page.evaluate(() => {
      const els = document.querySelectorAll('div');
      let stats = '';
      for (const el of els) {
        if (el.textContent && el.textContent.includes('HERMES') && el.textContent.includes('STARCRRAFT')) {
          stats = el.textContent;
          break;
        }
      }
      return stats;
    });
    
    if (hud) {
      console.log('[OK] HUD found:', hud.substring(0, 80));
    }

    // ─── Screenshot 2: API state visualization ──────────────────────────────
    // Create a simple HTML visualization of the entity data
    const stateRes = await fetch(`${BRIDGE_URL}/api/state`);
    const state = await stateRes.json();
    
    // Create a simple canvas-based bar chart showing entity counts
    const chartPage = await context.newPage();
    await chartPage.setContent(`
      <html>
      <body style="background:#000810; font-family:Courier New; color:#00ff88; padding:40px;">
        <h2 style="color:#00ffff;">Hermes StarCraft Dashboard — Entity Map</h2>
        <p>Bridge: ${BRIDGE_URL} | Viewer: ${VIEWER_URL}</p>
        <p>Total Entities: ${state.entities.length}</p>
        <canvas id="chart" width="800" height="400" style="background:#001020;border:1px solid #0a3a4a;"></canvas>
        <script>
          const entities = ${JSON.stringify(state.entities)};
          const byType = {};
          entities.forEach(e => { byType[e.scType] = (byType[e.scType] || 0) + 1; });
          
          const canvas = document.getElementById('chart');
          const ctx = canvas.getContext('2d');
          const types = Object.keys(byType);
          const barW = (canvas.width - 40) / types.length;
          
          ctx.fillStyle = '#0a2a3a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          types.forEach((type, i) => {
            const count = byType[type];
            const barH = (count / Math.max(...Object.values(byType))) * (canvas.height - 60);
            const x = 20 + i * barW;
            const y = canvas.height - 40 - barH;
            
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(x + 2, y, barW - 4, barH);
            
            ctx.fillStyle = '#00ffff';
            ctx.font = '10px Courier New';
            ctx.fillText(type, x + 2, canvas.height - 25);
            ctx.fillText(count, x + 2, y - 5);
          });
          
          ctx.fillStyle = '#0a5a6a';
          ctx.font = '12px Courier New';
          ctx.fillText('Entity Types in Hermes StarCraft Dashboard', 20, 20);
          ctx.fillText('Total: ' + entities.length + ' entities across ' + types.length + ' SC types', 20, 38);
        </script>
      </body>
      </html>
    `);
    
    await chartPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'entity-chart.png'),
      fullPage: false,
    });
    console.log('[OK] Saved: entity-chart.png');
    
    await chartPage.close();

  } catch (e) {
    console.error('[ERROR]', e.message);
  }

  await browser.close();
  console.log('\n[Done] Screenshots saved to', SCREENSHOTS_DIR);
  
  // List saved files
  const files = fs.readdirSync(SCREENSHOTS_DIR);
  for (const f of files) {
    const stat = fs.statSync(path.join(SCREENSHOTS_DIR, f));
    console.log('  -', f, `(${(stat.size / 1024).toFixed(1)} KB)`);
  }
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
