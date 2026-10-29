/**
 * Self-quiz E2E for current lecture-review-1 order:
 * mc, mc multi, mc multi, mc multi, short×3, open×2, cloud + end review.
 */
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import assert from 'assert';
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

const server = spawn('python3', ['-m', 'http.server', '8765'], { cwd: root, stdio: 'ignore' });
await sleep(700);
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();

async function checkAndNext() {
  if (await page.isVisible('#checkBtn')) {
    await page.click('#checkBtn');
    await page.waitForSelector('#feedback:not(.hidden)');
  }
  if (await page.isVisible('#nextBtn')) await page.click('#nextBtn');
}

async function answerMc(indices) {
  await page.waitForSelector('#mcBox:visible');
  for (const ix of indices) await page.check('#mc_' + ix);
  await checkAndNext();
}

try {
  await page.goto('http://127.0.0.1:8765/quiz/self.html?quiz=lecture-review-1', { waitUntil: 'networkidle' });
  await page.click('#startBtn');

  // Q0 mc single Aphrodite
  await answerMc([2]);
  // Q1 Atreus multi
  await answerMc([0, 1, 3]);
  // Q2 Troy multi
  await answerMc([0, 1, 3, 5]);
  // Q3 Cadmus multi
  await answerMc([0, 1, 3, 5]);

  // Q4 Ixion
  await page.waitForSelector('#answer:visible');
  await page.fill('#answer', 'it was Ixion');
  await checkAndNext();
  // Q5 Chiron
  await page.fill('#answer', 'Cheiron');
  await checkAndNext();
  // Q6 Cecrops
  await page.fill('#answer', 'Cecrops');
  await checkAndNext();

  // Q7 open
  await page.waitForSelector('#answerLong:visible');
  await page.fill('#answerLong', 'excavated Troy');
  await checkAndNext();
  // Q8 open
  await page.fill('#answerLong', 'judgement of paris');
  await checkAndNext();

  // Q9 cloud
  await page.waitForSelector('#cloudBox:visible');
  const inputs = page.locator('#cloudBox input');
  await inputs.nth(0).fill('wrath');
  await inputs.nth(1).fill('pride');
  await checkAndNext();

  await page.waitForSelector('#done', { timeout: 10000 });
  const score = (await page.textContent('#scoreLine')).trim();
  console.log('self-quiz all-types E2E: OK —', score);
  assert.ok(/got/i.test(score));

  // Review list present with your answers + correct
  const review = await page.textContent('#selfReviewList');
  assert.ok(/Your answer/i.test(review), 'self review missing your answer');
  assert.ok(/Ixion|Aphrodite|Cadmus|Troy|wrath/i.test(review), 'self review missing content');
  assert.ok(/Correct|Incorrect|No mark|Partial/i.test(review), 'self review missing marks');
  await page.screenshot({ path: path.join(shotsDir, 'self-review.png'), fullPage: true });
  console.log('SHOT: self-review.png');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
