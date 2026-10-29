/**
 * Hard Mode live: after Q5, presenter gate chooses (a) or (b).
 * Branch (b): phone types Troy MC; screenshot phone. Branch (a): phone sees taps.
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

async function waitLive(host) {
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (!(await host.evaluate(() => document.getElementById('live').classList.contains('hidden')))) return;
  }
  throw new Error('live UI never appeared');
}

/** Advance host past Q0–Q4 onto the Hard Mode gate (index 5). */
async function advanceToGate(host) {
  for (let i = 0; i < 5; i++) {
    await host.click('#nextBtn');
    await sleep(450);
  }
  await host.waitForSelector('#hmGateBox:visible', { timeout: 10000 });
  const prompt = await host.textContent('#prompt');
  if (!/Hard Mode/i.test(prompt || '')) throw new Error('expected Hard Mode gate, got: ' + prompt);
}

try {
  // ---- Branch (b): Type the answer ----
  {
    const host = await browser.newPage();
    host.on('dialog', async (d) => d.accept());
    await host.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
    // Toggle must be gone
    if (await host.locator('#hardModeSetup').count()) throw new Error('hardModeSetup should be removed');
    if (await host.locator('#hardModeLive').count()) throw new Error('hardModeLive should be removed');
    await host.click('#startRoomBtn');
    await waitLive(host);
    const room = (await host.textContent('#roomCodeDisplay')).trim();
    console.log('ROOM_B', room);

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(BASE + '/play.html?room=' + room, { waitUntil: 'networkidle' });
    await phone.fill('#nickInput', 'HardModeHero');
    await phone.click('#joinBtn');
    await sleep(1200);

    // Pre-gate: Q0 should be normal MC taps
    await phone.waitForSelector('#mcBox:visible', { timeout: 15000 });
    if (await phone.locator('#hardMcBox:visible').count()) {
      throw new Error('Q0 must be normal MC before gate');
    }

    await advanceToGate(host);

    // Phone waits while oracle decides
    await phone.waitForFunction(() => {
      const w = document.getElementById('waitPanel');
      const t = document.getElementById('waitText');
      return w && !w.classList.contains('hidden') && /deciding/i.test(t && t.textContent || '');
    }, { timeout: 10000 });
    console.log('PHONE_WAITING', await phone.textContent('#waitText'));

    await host.screenshot({ path: path.join(shotsDir, 'hm-gate-host.png'), fullPage: true });
    console.log('SHOT hm-gate-host.png');

    await host.click('#hmGateChooseType'); // (b)
    await sleep(900);

    // Next Q is Troy — Hard Mode text box on phone
    await phone.waitForSelector('#hardMcBox:visible', { timeout: 15000 });
    await phone.fill('#hardMcBox .hard-entries input', 'Hector, Priam, Hecuba, Cassandra, Andromache');
    await phone.screenshot({ path: path.join(shotsDir, 'hm-gate-phone.png'), fullPage: true });
    console.log('SHOT hm-gate-phone.png');
    // Also keep legacy shot name for continuity
    await phone.screenshot({ path: path.join(shotsDir, 'hard-mode-phone.png'), fullPage: true });
    await phone.click('#submitBtn');
    await sleep(1200);
    const status = await phone.textContent('#status');
    console.log('STATUS_B', status);
    if (!/sent|watch/i.test(status || '')) throw new Error('submit failed: ' + status);

    // Host hides option bars until reveal
    const barsHint = await host.textContent('#bars');
    if (!/Hard Mode|typing/i.test(barsHint || '')) {
      throw new Error('expected hard-mode hidden choices hint on host: ' + barsHint);
    }

    await host.click('#revealBtn');
    await sleep(800);
    const reveal = await host.textContent('#revealBox');
    console.log('REVEAL_B', (reveal || '').replace(/\s+/g, ' ').slice(0, 120));
    if (!/1\/1 correct/i.test(reveal || '')) throw new Error('expected 1/1 correct in hard mode');

    await host.click('#endBtn');
    await sleep(1000);
    await phone.close();
    await host.close();
  }

  // ---- Branch (a): Multiple choice ----
  {
    const host = await browser.newPage();
    host.on('dialog', async (d) => d.accept());
    await host.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
    await host.click('#startRoomBtn');
    await waitLive(host);
    const room = (await host.textContent('#roomCodeDisplay')).trim();
    console.log('ROOM_A', room);

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(BASE + '/play.html?room=' + room, { waitUntil: 'networkidle' });
    await phone.fill('#nickInput', 'EasyModeHero');
    await phone.click('#joinBtn');
    await sleep(1000);

    await advanceToGate(host);
    await host.click('#hmGateChooseMc'); // (a)
    await sleep(900);

    await phone.waitForSelector('#mcBox:visible', { timeout: 15000 });
    if (await phone.locator('#hardMcBox:visible').count()) {
      throw new Error('branch (a) must show tap MC, not hard text box');
    }
    await phone.click('.tap-option[data-index="0"]');
    await phone.click('.tap-option[data-index="1"]');
    await phone.click('.tap-option[data-index="3"]');
    await phone.click('.tap-option[data-index="5"]');
    await phone.click('.tap-option[data-index="6"]');
    await phone.click('#submitBtn');
    await sleep(1000);
    const status = await phone.textContent('#status');
    console.log('STATUS_A', status);
    if (!/sent|watch/i.test(status || '')) throw new Error('branch a submit failed: ' + status);

    await host.click('#endBtn');
    await sleep(800);
    await phone.close();
    await host.close();
  }

  console.log('HARDMODE_LIVE_PASS');
} catch (e) {
  code = 1;
  console.error('HARDMODE_LIVE_FAIL', e.stack || e);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(code);
