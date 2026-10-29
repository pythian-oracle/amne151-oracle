/**
 * Hard Mode live: after Judgement (Q5), presenter gate chooses (a) or (b).
 * Branch (b): phone types post-gate MC in a single textarea; screenshot phone.
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

    await phone.waitForSelector('#mcBox:visible', { timeout: 15000 });
    if (await phone.locator('#hardMcBox:visible').count()) {
      throw new Error('Q0 must be normal MC before gate');
    }

    await advanceToGate(host);

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

    // Earth-born short — skip past it to Atreus MC
    await phone.waitForSelector('#answer:visible', { timeout: 15000 });
    await host.click('#nextBtn');
    await sleep(900);

    // Atreus — Hard Mode single textarea
    await phone.waitForSelector('#hardMcBox textarea.hard-entry:visible', { timeout: 15000 });
    if (await phone.locator('button.hard-add').count()) throw new Error('Add button must be gone');
    const hint = await phone.textContent('#typeHint');
    if (!/Name as many as you can/i.test(hint || '')) throw new Error('bad hint: ' + hint);
    await phone.fill(
      '#hardMcBox textarea.hard-entry',
      'Agamemnon Menelaos Orestes Klytaimnestra Elektra'
    );
    await phone.screenshot({ path: path.join(shotsDir, 'hm-gate-phone.png'), fullPage: true });
    console.log('SHOT hm-gate-phone.png');
    await phone.screenshot({ path: path.join(shotsDir, 'hard-mode-phone.png'), fullPage: true });
    await phone.click('#submitBtn');
    await sleep(1200);
    const status = await phone.textContent('#status');
    console.log('STATUS_B', status);
    if (!/sent|watch/i.test(status || '')) throw new Error('submit failed: ' + status);

    const barsHint = await host.textContent('#bars');
    if (!/Hard Mode|typing/i.test(barsHint || '')) {
      throw new Error('expected hard-mode hidden choices hint on host: ' + barsHint);
    }

    await host.click('#revealBtn');
    await sleep(800);
    const reveal = await host.textContent('#revealBox');
    console.log('REVEAL_B', (reveal || '').replace(/\s+/g, ' ').slice(0, 140));
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

    // skip Earth-born to Atreus
    await phone.waitForSelector('#answer:visible', { timeout: 15000 });
    await host.click('#nextBtn');
    await sleep(900);

    await phone.waitForSelector('#mcBox:visible', { timeout: 15000 });
    if (await phone.locator('#hardMcBox:visible').count()) {
      throw new Error('branch (a) must show tap MC, not hard text box');
    }
    for (const ix of [0, 1, 3, 5, 6]) {
      await phone.click(`.tap-option[data-index="${ix}"]`);
    }
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
