/**
 * Seed ~20 cloud words on a live room, screenshot packed cloud, wipe.
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

const PORT = 8771;
const BASE = `http://127.0.0.1:${PORT}/quiz`;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await sleep(600);

const SAMPLE = [
  ['wrath', 'anger'], ['pride'], ['honour', 'glory'], ['rage'], ['wrath'],
  ['brave'], ['grief'], ['wrath', 'pride'], ['honour'], ['fury'],
  ['glory', 'rage'], ['anger', 'pride'], ['wrath'], ['sulking'], ['timē'],
  ['honour', 'wrath'], ['rage', 'fury'], ['pride'], ['glory'], ['anger'],
];

const browser = await playwright.chromium.launch({ headless: true });
let code = 0;
try {
  const host = await browser.newPage();
  host.on('dialog', async (d) => d.accept());
  await host.goto(BASE + '/host.html', { waitUntil: 'networkidle' });
  await host.click('#startRoomBtn');
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (!(await host.evaluate(() => document.getElementById('live').classList.contains('hidden')))) break;
  }
  const room = (await host.textContent('#roomCodeDisplay')).trim();
  console.log('ROOM', room);

  // Advance to cloud (index 10): 5 next → gate → choose (a) → 4 next → cloud
  for (let i = 0; i < 5; i++) {
    await host.click('#nextBtn');
    await sleep(350);
  }
  await host.waitForSelector('#hmGateBox:visible', { timeout: 8000 });
  await host.click('#hmGateChooseMc');
  await sleep(450);
  for (let i = 0; i < 4; i++) {
    await host.click('#nextBtn');
    await sleep(350);
  }
  const prompt = await host.textContent('#prompt');
  console.log('PROMPT', prompt.slice(0, 60));
  if (!/Achilles/i.test(prompt)) throw new Error('not on cloud Q: ' + prompt);

  // Seed answers via Firebase from page
  const seeded = await host.evaluate(async ({ roomCode, samples }) => {
    const cfg = window.FIREBASE_CONFIG;
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
    const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
    const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js');
    const results = [];
    for (let i = 0; i < samples.length; i++) {
      const app = initializeApp(cfg, 'seed' + i + Math.random().toString(36).slice(2, 6));
      const auth = getAuth(app);
      await signInAnonymously(auth);
      const uid = auth.currentUser.uid;
      const words = {};
      samples[i].forEach((w, j) => {
        const norm = w.toLowerCase().replace(/\s+/g, ' ').trim();
        words[j] = { raw: w, norm };
      });
      const payload = {
        kind: 'cloud',
        words,
        raw: samples[i].join(', '),
        norm: samples[i].map((w) => w.toLowerCase()).join(' '),
        at: Date.now()
      };
      try {
        await set(ref(getDatabase(app), `rooms/${roomCode}/answers/10/${uid}`), payload);
        results.push('OK');
      } catch (e) {
        results.push(e.code || e.message);
      }
    }
    return results;
  }, { roomCode: room, samples: SAMPLE });
  console.log('SEED', seeded.filter((x) => x === 'OK').length + '/' + seeded.length);

  await sleep(2500);
  const info = await host.evaluate(() => {
    const stage = document.querySelector('#cloud .wc-stage');
    const words = [...document.querySelectorAll('#cloud .wc-word')];
    const sizes = words.map((w) => parseFloat(getComputedStyle(w).fontSize));
    const rots = words.map((w) => w.style.transform || '');
    const wrath = words.find((w) => /wrath/i.test(w.textContent));
    const rare = words.find((w) => /sulking|brave|timē|grief/i.test(w.textContent));
    return {
      hasStage: !!stage,
      wordCount: words.length,
      meta: (document.querySelector('#cloud .wc-meta') || {}).textContent || '',
      topHasClass: !!document.querySelector('#cloud .wc-word.wc-top'),
      allHorizontal: rots.every((t) => !t || t === 'none' || t === 'rotate(0deg)'),
      maxFs: Math.max(...sizes, 0),
      minFs: Math.min(...sizes.filter(Boolean), 999),
      wrathFs: wrath ? parseFloat(getComputedStyle(wrath).fontSize) : 0,
      rareFs: rare ? parseFloat(getComputedStyle(rare).fontSize) : 0
    };
  });
  console.log('CLOUD', JSON.stringify(info));
  if (!info.hasStage || info.wordCount < 8) throw new Error('word cloud not rendered well: ' + JSON.stringify(info));
  if (!info.allHorizontal) throw new Error('words must be horizontal (no rotation)');
  if (!(info.wrathFs > info.rareFs * 1.3)) throw new Error('frequency sizing not noticeable: ' + JSON.stringify(info));
  if (!(info.maxFs >= info.minFs * 1.5)) throw new Error('size range too flat: ' + JSON.stringify(info));

  await host.screenshot({ path: path.join(shotsDir, 'host-wordcloud.png'), fullPage: true });
  console.log('SHOT host-wordcloud.png');

  // Review all (while still in live view): cloud should be plain text list, not graphic
  await host.click('#reviewBtn');
  await sleep(800);
  const reviewCloud = await host.evaluate(() => {
    const items = [...document.querySelectorAll('#reviewList .review-item')];
    const cloudItem = items.find((el) => /One word that describes Achilles/i.test(el.textContent || ''))
      || items.find((el) => el.querySelector('.rq-cloud-list'));
    if (!cloudItem) return { ok: false, reason: 'no cloud review item' };
    const list = cloudItem.querySelector('.rq-cloud-list');
    const graphic = cloudItem.querySelector('.wc-stage, .wc-word, [data-review-cloud]');
    return {
      ok: !!list && !graphic,
      text: (list && list.textContent) || '',
      hasGraphic: !!graphic
    };
  });
  console.log('REVIEW_CLOUD', JSON.stringify(reviewCloud));
  if (!reviewCloud.ok) throw new Error('review cloud should be text list: ' + JSON.stringify(reviewCloud));
  if (!/wrath\s*×\s*\d+/i.test(reviewCloud.text)) throw new Error('expected wrath ×N in list: ' + reviewCloud.text);
  await host.screenshot({ path: path.join(shotsDir, 'host-review.png'), fullPage: true });
  console.log('SHOT host-review.png');

  await host.click('#closeReviewBtn');
  await sleep(400);
  await host.click('#endBtn', { force: true });
  await sleep(1000);
  console.log('WORDCLOUD_TEST_PASS');
} catch (e) {
  code = 1;
  console.error('WORDCLOUD_TEST_FAIL', e.stack || e);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(code);
