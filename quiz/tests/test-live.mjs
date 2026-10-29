/**
 * Full live smoke against amne151-sphinx (Anonymous + published rules).
 * Host + 3 phones: short, open, mc single, mc multi, cloud; reveal; board; wipe.
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
const log = [];
function L(m) { console.log(m); log.push(m); }
function fail(msg) { throw new Error(msg); }
let exitCode = 0;

async function waitVisible(page, sel, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const ok = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        if (el.classList.contains('hidden')) return false;
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden';
      }, sel);
      if (ok) return;
    } catch (_) {}
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
  if (!/^[A-Z0-9]{4}$/.test(room)) fail('bad room code');

  await host.screenshot({ path: path.join(shotsDir, 'host-room-qr.png'), fullPage: true });
  L('SHOT: host-room-qr.png');

  async function joinPlayer(name, nick) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.on('dialog', async (d) => { L(name + '_DIALOG: ' + d.message()); await d.accept(); });
    await page.goto(BASE + '/play.html?room=' + room, { waitUntil: 'networkidle' });
    await page.fill('#nickInput', nick);
    await page.click('#joinBtn');
    await sleep(1800);
    const joined = await page.evaluate(() => {
      const jp = document.getElementById('joinPanel');
      return jp && jp.classList.contains('hidden');
    });
    L(name + '_JOINED: ' + joined + ' nick=' + nick);
    if (!joined) fail(name + ' failed to join');
    return { ctx, page, name, nick };
  }

  const p1 = await joinPlayer('P1', 'Achilles');
  const p2 = await joinPlayer('P2', 'Hector');
  const p3 = await joinPlayer('P3', 'Achilles'); // uniquify → Achilles 2
  await p1.page.screenshot({ path: path.join(shotsDir, 'phone-joined.png'), fullPage: true });
  L('SHOT: phone-joined.png');

  async function scoreLine(p) {
    for (const id of ['myScore', 'waitScore', 'endScore']) {
      const t = await p.page.evaluate((i) => {
        const el = document.getElementById(i);
        if (!el || el.classList.contains('hidden')) return '';
        const st = getComputedStyle(el);
        if (st.display === 'none') return '';
        return (el.textContent || '').trim();
      }, id);
      if (t) return t;
    }
    // any visible .my-score
    return await p.page.evaluate(() => {
      const els = document.querySelectorAll('.my-score');
      for (const el of els) {
        if (!el.classList.contains('hidden') && getComputedStyle(el).display !== 'none') {
          return (el.textContent || '').trim();
        }
      }
      return '';
    });
  }

  async function answerShort(p, text) {
    await sleep(400);
    await waitVisible(p.page, '#answerPanel');
    const visible = await p.page.evaluate(() => {
      const a = document.getElementById('answer');
      return a && !a.classList.contains('hidden');
    });
    if (!visible) { L(p.name + '_NO_SHORT'); return; }
    await p.page.fill('#answer', text);
    await p.page.click('#submitBtn');
    await sleep(900);
    L(p.name + '_SHORT: ' + (await p.page.textContent('#status')));
  }

  async function answerOpen(p, text) {
    await sleep(400);
    await waitVisible(p.page, '#answerPanel');
    const visible = await p.page.evaluate(() => {
      const a = document.getElementById('answerLong');
      return a && !a.classList.contains('hidden');
    });
    if (!visible) { L(p.name + '_NO_OPEN'); return; }
    await p.page.fill('#answerLong', text);
    await p.page.click('#submitBtn');
    await sleep(900);
    L(p.name + '_OPEN: ' + (await p.page.textContent('#status')));
  }

  async function answerMc(p, indices) {
    await sleep(500);
    await waitVisible(p.page, '#mcBox');
    for (const ix of indices) {
      await p.page.click(`.tap-option[data-index="${ix}"]`);
    }
    await p.page.click('#submitBtn');
    await sleep(900);
    L(p.name + '_MC: ' + (await p.page.textContent('#status')));
  }

  async function answerCloud(p, words) {
    await sleep(500);
    await waitVisible(p.page, '#cloudBox');
    const inputs = p.page.locator('#cloudBox input');
    for (let i = 0; i < words.length; i++) await inputs.nth(i).fill(words[i]);
    await p.page.click('#submitBtn');
    await sleep(900);
    L(p.name + '_CLOUD: ' + (await p.page.textContent('#status')));
  }

  async function hostNext() {
    await host.click('#nextBtn');
    await sleep(800);
  }

  // --- Q0 short: P1 fast correct, P2 slower correct, P3 wrong ---
  L('Q0_PROMPT: ' + (await host.textContent('#prompt')).slice(0, 70));
  await answerShort(p1, 'Ixion');
  await sleep(2500); // speed gap
  await answerShort(p2, 'it was Ixion');
  await answerShort(p3, 'Sisyphus');
  await sleep(800);
  L('RESP_Q0: ' + (await host.textContent('#respCount')));
  L('P1_SCORE_Q0: ' + (await scoreLine(p1)));
  L('P2_SCORE_Q0: ' + (await scoreLine(p2)));
  L('P3_SCORE_Q0: ' + (await scoreLine(p3)));

  // skip Q1, Q2 shorts
  await hostNext(); // Q1
  await hostNext(); // Q2
  await hostNext(); // Q3 open
  L('Q3_PROMPT: ' + (await host.textContent('#prompt')).slice(0, 70));
  await answerOpen(p1, 'Excavated Troy at Hisarlik');
  await answerOpen(p2, 'Found the Mask of Agamemnon');
  await answerOpen(p3, 'Dug at Mycenae');
  await sleep(600);
  L('RESP_Q3: ' + (await host.textContent('#respCount')));

  // skip Q4 open, Q5 short, Q6 short → Q7 mc single
  await hostNext(); // Q4
  await hostNext(); // Q5
  await hostNext(); // Q6
  await hostNext(); // Q7
  let prompt = await host.textContent('#prompt');
  L('Q7_PROMPT: ' + prompt.slice(0, 70));
  if (!/Which goddess/i.test(prompt)) fail('expected MC single at Q7, got: ' + prompt);
  await answerMc(p1, [2]); // correct Aphrodite
  await sleep(1500);
  await answerMc(p2, [1]); // wrong
  await answerMc(p3, [2]); // correct but slower
  await sleep(600);

  await hostNext(); // Q8 mc multi
  prompt = await host.textContent('#prompt');
  L('Q8_PROMPT: ' + prompt.slice(0, 70));
  if (!/House of Atreus/i.test(prompt)) fail('expected MC multi');
  // correct set from JSON — check
  const quiz = JSON.parse(fs.readFileSync(path.join(quizDir, 'quizzes/lecture-review-1.json'), 'utf8'));
  const multiCorrect = quiz.questions[8].correct;
  L('Q8_CORRECT: ' + JSON.stringify(multiCorrect));
  await answerMc(p1, multiCorrect); // exact
  await sleep(1200);
  await answerMc(p2, [multiCorrect[0]]); // partial
  await answerMc(p3, [0, 2]); // whatever

  await hostNext(); // Q9 cloud (last)
  prompt = await host.textContent('#prompt');
  L('Q9_PROMPT: ' + prompt.slice(0, 70));
  if (!/Achilles/i.test(prompt)) fail('expected cloud');
  await answerCloud(p1, ['wrath', 'pride']);
  await answerCloud(p2, ['anger']);
  await answerCloud(p3, ['rage', 'honor']);

  // Reveal last → should show board + final podium
  await host.click('#revealBtn');
  await sleep(1200);
  const boardState = await host.evaluate(() => {
    const panel = document.getElementById('boardPanel');
    const podium = document.getElementById('podium');
    const lb = document.getElementById('leaderboard');
    return {
      boardVisible: panel && !panel.classList.contains('hidden'),
      title: (document.getElementById('boardTitle') || {}).textContent || '',
      podiumVisible: podium && !podium.classList.contains('hidden'),
      boardText: (lb && lb.textContent || '').trim(),
      podiumText: (podium && podium.textContent || '').trim(),
    };
  });
  L('BOARD: ' + JSON.stringify(boardState));
  if (!boardState.boardVisible) fail('board not visible after reveal');
  if (!/Achilles/i.test(boardState.boardText + boardState.podiumText)) fail('leaderboard missing Achilles');
  if (!boardState.podiumVisible && !/Final podium|Top scorers/i.test(boardState.title)) {
    L('WARN: podium title=' + boardState.title);
  }

  await host.screenshot({ path: path.join(shotsDir, 'host-leaderboard.png'), fullPage: true });
  L('SHOT: host-leaderboard.png');

  // Phone scores/ranks
  for (const p of [p1, p2, p3]) {
    const s = await scoreLine(p);
    L(p.name + '_FINAL_SCORE: ' + s);
    if (!/Score\s+\d+/i.test(s)) fail(p.name + ' missing score display: ' + s);
    if (!/rank/i.test(s)) fail(p.name + ' missing rank: ' + s);
  }

  // Ranking: P1 should beat P2 (more correct + faster)
  const parseScore = (s) => {
    const m = String(s).match(/Score\s+(\d+)/i);
    return m ? Number(m[1]) : -1;
  };
  const s1 = parseScore(await scoreLine(p1));
  const s2 = parseScore(await scoreLine(p2));
  const s3 = parseScore(await scoreLine(p3));
  L(`SCORES_NUM: P1=${s1} P2=${s2} P3=${s3}`);
  if (s1 <= 0) fail('P1 should have points');
  if (s1 <= s2) fail('expected P1 > P2 (more correct + speed)');
  // With openedByQ, past-question speed is preserved (not maxed to +500 for everyone).
  if (s1 >= 4500) fail('P1 should not have max speed on every past Q (got ' + s1 + ') — openedByQ missing?');
  if (s1 < 3500) fail('P1 score unexpectedly low: ' + s1);

  // Leaderboard button still works
  await host.click('#boardBtn');
  await sleep(400);

  // Verify Firebase has players before wipe
  const beforeWipe = await host.evaluate(async (roomCode) => {
    const cfg = window.FIREBASE_CONFIG;
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
    const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
    const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js');
    const app = initializeApp(cfg, 'check-' + Math.random().toString(36).slice(2));
    await signInAnonymously(getAuth(app));
    const db = getDatabase(app);
    const players = (await get(ref(db, 'rooms/' + roomCode + '/players'))).val();
    const answers = (await get(ref(db, 'rooms/' + roomCode + '/answers'))).val();
    return {
      playerCount: players ? Object.keys(players).length : 0,
      nicks: players ? Object.values(players).map((p) => p.nick) : [],
      answerQs: answers ? Object.keys(answers) : [],
    };
  }, room);
  L('BEFORE_WIPE: ' + JSON.stringify(beforeWipe));
  if (beforeWipe.playerCount < 3) fail('expected 3 players in RTDB');

  // End & wipe
  await host.click('#endBtn');
  await sleep(2500);

  const afterWipe = await browser.newPage().then(async (pg) => {
    await pg.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
    const result = await pg.evaluate(async (roomCode) => {
      const cfg = window.FIREBASE_CONFIG;
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
      const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
      const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js');
      const app = initializeApp(cfg, 'wipe-' + Math.random().toString(36).slice(2));
      await signInAnonymously(getAuth(app));
      const db = getDatabase(app);
      const roomVal = (await get(ref(db, 'rooms/' + roomCode))).val();
      return roomVal;
    }, room);
    await pg.close();
    return result;
  });
  L('AFTER_WIPE_ROOM: ' + JSON.stringify(afterWipe));
  if (afterWipe != null) fail('room still present after wipe');

  L('LIVE_SMOKE_PASS');
} catch (e) {
  exitCode = 1;
  L('LIVE_SMOKE_FAIL: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
process.exit(exitCode);
