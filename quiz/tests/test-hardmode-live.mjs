/**
 * Hard Mode live: host enables toggle, phone types MC answers, screenshot phone.
 */
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const shotsDir = '/workspace/AMNE151/quiz-shots';
fs.mkdirSync(shotsDir, { recursive: true });

let playwright;
try {
  playwright = await import(pathToFileURL('/tmp/node_modules/playwright/index.mjs').href);
} catch {
  playwright = createRequire('/tmp/package.json')('playwright');
}

const PORT = 8772;
const BASE = `http://127.0.0.1:${PORT}/quiz`;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await sleep(600);

const browser = await playwright.chromium.launch({ headless: true });
let code = 0;
try {
  const host = await browser.newPage();
  host.on('dialog', async (d) => d.accept());
  await host.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
  await host.locator('label[for="hardModeSetup"]').click();
  await host.click('#startRoomBtn');
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (!(await host.evaluate(() => document.getElementById('live').classList.contains('hidden')))) break;
  }
  const room = (await host.textContent('#roomCodeDisplay')).trim();
  console.log('ROOM', room);
  const hardOn = await host.evaluate(() => document.getElementById('hardModeLive')?.checked);
  if (!hardOn) throw new Error('hardModeLive not checked after start');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(BASE + '/play.html?room=' + room, { waitUntil: 'networkidle' });
  await phone.fill('#nickInput', 'HardModeHero');
  await phone.click('#joinBtn');
  await phone.waitForSelector('#hardMcBox:visible', { timeout: 15000 });
  await phone.fill('#hardMcBox .hard-entries input', 'Aphrodite');
  await phone.screenshot({ path: path.join(shotsDir, 'hard-mode-phone.png'), fullPage: true });
  console.log('SHOT hard-mode-phone.png');
  await phone.click('#submitBtn');
  await sleep(1200);
  const status = await phone.textContent('#status');
  console.log('STATUS', status);
  if (!/sent|watch/i.test(status || '')) throw new Error('submit failed: ' + status);

  await host.click('#revealBtn');
  await sleep(800);
  const reveal = await host.textContent('#revealBox');
  console.log('REVEAL', (reveal || '').replace(/\s+/g, ' ').slice(0, 120));
  if (!/1\/1 correct/i.test(reveal || '')) throw new Error('expected 1/1 correct in hard mode');

  await host.click('#endBtn');
  await sleep(1000);
  console.log('HARDMODE_LIVE_PASS');
} catch (e) {
  code = 1;
  console.error('HARDMODE_LIVE_FAIL', e.stack || e);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(code);
