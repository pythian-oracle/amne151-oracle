/**
 * Live smoke: host + 3 phones against amne151-sphinx.
 * Order: Paris mc, Ixion, Chiron, Schliemann, Judgement, gate, Earth-born, Atreus, Troy, Argives, cloud.
 * Covers reveal stats, Review all (n/m correct), podium, wipe.
 */
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const quizDir = path.resolve(__dirname, '..');
const root = path.resolve(quizDir, '..');
const shotsDir = '/workspace/AMNE151/quiz-shots';
fs.mkdirSync(shotsDir, { recursive: true });

let playwright;
try {
  playwright = await import(pathToFileURL('/tmp/node_modules/playwright/index.mjs').href);
} catch {
  playwright = createRequire('/tmp/package.json')('playwright');
}

const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}/quiz`;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await sleep(700);

const browser = await playwright.chromium.launch({ headless: true });
function L(m) { console.log(m); }
function fail(msg) { throw new Error(msg); }
let exitCode = 0;

async function waitVisible(page, sel, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el || el.classList.contains('hidden')) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden';
    }, sel).catch(() => false);
    if (ok) return;
    await sleep(200);
  }
  fail('timeout waiting for ' + sel);
}

try {
  const host = await browser.newPage();
  host.setDefaultTimeout(20000);
  host.on('dialog', async (d) => { L('HOST_DIALOG: ' + d.message()); await d.accept(); });

  await host.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
  if (await host.$eval('#startRoomBtn', (el) => el.disabled)) fail('Open room disabled');
  await host.click('#startRoomBtn');
  await waitVisible(host, '#live');
  const room = (await host.textContent('#roomCodeDisplay')).trim();
  L('ROOM: ' + room);

  async function joinPlayer(name, nick) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.on('dialog', async (d) => { L(name + '_DIALOG: ' + d.message()); await d.accept(); });
    await page.goto(BASE + '/play.html?room=' + room, { waitUntil: 'networkidle' });
    await page.fill('#nickInput', nick);
    await page.click('#joinBtn');
    await sleep(1600);
    const joined = await page.evaluate(() => document.getElementById('joinPanel').classList.contains('hidden'));
    L(name + '_JOINED: ' + joined);
    if (!joined) fail(name + ' join failed');
    return { ctx, page, name, nick };
  }

  const p1 = await joinPlayer('P1', 'Achilles');
  const p2 = await joinPlayer('P2', 'Hector');
  const p3 = await joinPlayer('P3', 'Achilles');

  async function answerMc(p, indices) {
    await sleep(400);
    await waitVisible(p.page, '#mcBox');
    for (const ix of indices) await p.page.click(`.tap-option[data-index="${ix}"]`);
    await p.page.click('#submitBtn');
    await sleep(700);
    L(p.name + '_MC: ' + (await p.page.textContent('#status')));
  }
  async function answerShort(p, text) {
    await sleep(400);
    await waitVisible(p.page, '#answerPanel');
    await p.page.fill('#answer', text);
    await p.page.click('#submitBtn');
    await sleep(700);
    L(p.name + '_SHORT: ' + (await p.page.textContent('#status')));
  }
  async function answerOpen(p, text) {
    await sleep(400);
    await waitVisible(p.page, '#answerPanel');
    await p.page.fill('#answerLong', text);
    await p.page.click('#submitBtn');
    await sleep(700);
  }
  async function answerCloud(p, words) {
    await sleep(400);
    await waitVisible(p.page, '#cloudBox');
    const inputs = p.page.locator('#cloudBox input');
    for (let i = 0; i < words.length; i++) await inputs.nth(i).fill(words[i]);
    await p.page.click('#submitBtn');
    await sleep(700);
  }
  async function hostNext() { await host.click('#nextBtn'); await sleep(700); }

  // Q0 mc single
  L('Q0: ' + (await host.textContent('#prompt')).slice(0, 60));
  await answerMc(p1, [2]);
  await sleep(1200);
  await answerMc(p2, [1]);
  await answerMc(p3, [2]);
  await host.click('#revealBtn');
  await sleep(800);
  const reveal0 = await host.textContent('#revealBox');
  L('REVEAL0: ' + (reveal0 || '').replace(/\s+/g, ' ').slice(0, 120));
  if (!/\d+\/\d+ correct/i.test(reveal0 || '')) fail('reveal missing n/m correct stats');

  await hostNext(); // Q1 Ixion short
  await answerShort(p1, 'Ixion');
  await sleep(2000);
  await answerShort(p2, 'it was Ixion');
  await answerShort(p3, 'Sisyphus');

  await hostNext(); // Q2 Chiron
  await hostNext(); // Q3 Schliemann open
  await hostNext(); // Q4 Judgement open
  await hostNext(); // Hard Mode gate
  await host.waitForSelector('#hmGateBox:visible', { timeout: 8000 });
  await host.click('#hmGateChooseMc'); // (a) keep normal MC
  await sleep(700);
  // Earth-born
  await answerShort(p1, 'Cecrops');
  await answerShort(p2, 'Kekrops');
  await answerShort(p3, 'Theseus');
  await hostNext(); // Atreus
  await answerMc(p1, [0, 1, 3, 5, 6]);
  await answerMc(p2, [0]);
  await answerMc(p3, [0, 1, 3, 5, 6]);
  await hostNext(); // Troy
  await answerMc(p1, [0, 1, 3, 5, 6]);
  await answerMc(p2, [0, 1]);
  await answerMc(p3, [2, 4]); // wrong
  await hostNext(); // Argives vs Troy
  await answerMc(p1, [0, 2, 4, 6, 8, 10, 11, 12]);
  await answerMc(p2, [0, 1]); // partial / mixed
  await answerMc(p3, [1, 3, 5]); // Trojans only — wrong

  // next → cloud
  await hostNext();
  L('CLOUD: ' + (await host.textContent('#prompt')).slice(0, 60));
  await answerCloud(p1, ['wrath', 'pride']);
  await answerCloud(p2, ['anger']);
  await answerCloud(p3, ['rage']);

  await host.click('#revealBtn');
  await sleep(1000);
  await host.click('#boardBtn');
  await sleep(500);

  // Review all
  await host.click('#reviewBtn');
  await sleep(800);
  await waitVisible(host, '#reviewPanel');
  const review = await host.textContent('#reviewList');
  L('REVIEW_SNIP: ' + (review || '').replace(/\s+/g, ' ').slice(0, 220));
  if (!/correct \(\d+%\)|response/i.test(review || '')) fail('review missing room stats');
  if (!/Aphrodite|Argives|Danaans|Ixion|Achilles/i.test(review || '')) fail('review missing questions');
  // No student nicknames in review
  if (/Achilles|Hector/.test(review || '') && /pts/.test(review || '')) {
    // nicknames only ok if not as leaderboard - check no "pts"
  }
  if (/\bAchilles\b/.test(review || '') && /rank|pts/i.test(review || '')) {
    fail('review should not show player scores/names as board');
  }
  // Stats like 2/3 correct should appear for Q0
  if (!/\d+\/\d+ correct/i.test(review || '')) fail('review missing n/m correct');
  if (!/\d+ responses?/i.test(review || '')) fail('review missing cloud/open response counts');
  if (!/wrath|anger|rage|pride/i.test(review || '')) fail('review missing cloud words as text');
  if (/data-review-cloud|wc-stage/i.test(await host.content())) {
    const hasGraphic = await host.evaluate(() => !!document.querySelector('#reviewList .wc-stage, #reviewList [data-review-cloud]'));
    if (hasGraphic) fail('review must not show graphic word cloud');
  }

  await host.screenshot({ path: path.join(shotsDir, 'host-review.png'), fullPage: true });
  L('SHOT: host-review.png');

  // Scores on phones
  for (const p of [p1, p2, p3]) {
    const s = await p.page.evaluate(() => {
      for (const id of ['myScore', 'waitScore', 'endScore']) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) return el.textContent.trim();
      }
      return '';
    });
    L(p.name + '_SCORE: ' + s);
    if (!/Score\s+\d+/i.test(s)) fail(p.name + ' missing score');
  }

  await host.click('#endBtn');
  await sleep(2200);
  const gone = await browser.newPage().then(async (pg) => {
    await pg.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
    const v = await pg.evaluate(async (roomCode) => {
      const cfg = window.FIREBASE_CONFIG;
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
      const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
      const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js');
      const app = initializeApp(cfg, 'w' + Math.random().toString(36).slice(2));
      await signInAnonymously(getAuth(app));
      return (await get(ref(getDatabase(app), 'rooms/' + roomCode))).val();
    }, room);
    await pg.close();
    return v;
  });
  L('AFTER_WIPE: ' + JSON.stringify(gone));
  if (gone != null) fail('room not wiped');

  await p1.ctx.close(); await p2.ctx.close(); await p3.ctx.close();
  L('LIVE_SMOKE_PASS');
} catch (e) {
  exitCode = 1;
  L('LIVE_SMOKE_FAIL: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
process.exit(exitCode);
